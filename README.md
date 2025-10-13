## Обзор

Проект собирает экспериментальную витрину данных с веб-интерфейсом на React и API на FastAPI.
Этот документ описывает локальный запуск, а также инфраструктурные практики, которые мы
используем для обеспечения качества и стабильности.

![Coverage badge](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/gh-pages/coverage/coverage.json)

## Управление релизами

- Заголовки pull request-ов должны соответствовать [Conventional Commit](https://www.conventionalcommits.org/ru/v1.0.0/) — это проверяется GitHub Actions (`semantic-pull-requests`).
- После слияния в `main` [Release Drafter](.github/release-drafter.yml) обновляет черновик следующего релиза и группирует изменения по SemVer.
- Для публикации стабильной версии создайте аннотированный тег `vMAJOR.MINOR.PATCH` и запушьте его. Workflow [`publish-release`](.github/workflows/publish-release.yml) автоматически опубликует релиз на GitHub, используя описание из черновика.
- Версия приложения хранится в `backend/app/version.py`. Обновлять её и переносить записи из `CHANGELOG.md` помогает утилита `./scripts/bump_version.py <major|minor|patch>` — она откажется работать, если секция `Unreleased` пуста.
- После публикации синхронизируйте `CHANGELOG.md`, перенеся записи из секции `Unreleased` в новую версию.

## Быстрый старт

1. Склонируйте репозиторий и установите зависимости для фронтенда и бэкенда.
2. **Вариант для VS Code/Dev Containers:** откройте папку в контейнере разработки — сервисы Postgres/Redis/MinIO поднимутся автоматически, а зависимости установятся через `postCreateCommand`.
3. При локальном запуске без devcontainer поднимите сопутствующие сервисы (Postgres, Redis, MinIO) через `docker-compose`.
4. Запустите бэкенд и фронтенд в отдельных терминалах.
5. Выполните автоматические тесты и линтеры (см. раздел «Проверка работоспособности»).

> Подробный план развития проекта смотрите в [ROADMAP.md](ROADMAP.md), требования к
> контрибьюторам — в [CONTRIBUTING.md](CONTRIBUTING.md), архитектурные решения и диаграммы —
> в [docs/architecture.md](docs/architecture.md).

## Запуск фронтенда

В некоторых конфигурациях dev-container возникают проблемы с определением папки `frontend/`, если выполнять команды (например, `npm install`) из корня репозитория. Скрипт ниже формирует абсолютный путь к каталогу, после чего вызывает `npm` и предотвращает ошибку «no filesystem provider for folder frontend».

```bash
# установка зависимостей, не покидая корень репозитория
./scripts/install_frontend_deps.sh

# запуск Vite dev-сервера
cd frontend
npm run dev
```

## Запуск бэкенда

```bash
cd backend
pip install -r app/requirements.txt
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

### Политика загрузки и документация API

- `POST /api/v1/upload` принимает файлы с расширениями, перечисленными в переменной окружения
  `ALLOWED_UPLOAD_EXTENSIONS` (по умолчанию CSV/TSV/XLSX/XLS) и автоматически отклоняет
  превышающие лимит размера (`MAX_UPLOAD_SIZE_MB`). Для повторяющихся запросов используйте
  заголовок `Idempotency-Key`, чтобы повторно получить сохранённый результат без дублирования
  данных. Кэш ответов очищается по TTL (`IDEMPOTENCY_CACHE_TTL_SECONDS`) и ограничению на число
  записей (`IDEMPOTENCY_CACHE_MAX_ENTRIES`), что предотвращает неограниченный рост памяти.
- При наличии переменной `CLAMAV_SCAN_URL` каждый файл отправляется на проверку ClamAV перед
  сохранением.
- Эндпоинты документированы в интерактивной Swagger-спецификации `http://localhost:8000/docs`.
- Для тяжёлых наборов данных доступна асинхронная обработка: запрос `POST /api/v1/extract/async`
  ставит задачу в очередь Redis/RQ и возвращает `task_id`, а `GET /api/v1/tasks/{task_id}` позволяет
  отслеживать статусы (`queued`, `started`, `finished`, `failed`) и получать итоговый payload.

### Асинхронная обработка и фоновые задачи

1. Включите очередь задач в секции `env` SOPS-манифеста (см. раздел «Управление секретами»)
   или через переменные окружения: установите `TASK_QUEUE_ENABLED=1` и при необходимости
   измените `TASK_QUEUE_NAME`/`TASK_DEFAULT_TIMEOUT`.
2. Поднимите Redis (можно через `docker-compose` или локально) и запустите RQ-воркер:

   ```bash
   cd backend
   python -m app.worker
   ```

3. Клиенты могут проверять статус фоновых задач через `GET /api/v1/tasks/{task_id}` или подписаться
   на обновления (например, с помощью периодического polling/SSE на фронтенде). Ошибки обработки
   возвращаются в поле `error` и логируются для дальнейшего анализа.

Для полноценной разработки рекомендуется использовать Postgres вместо локального файлового
хранилища. Сформируйте SOPS-файл на основе `secrets/example.secrets.yaml`, расшифруйте его при
запуске (или экспортируйте переменные окружения вручную) и примените миграции Alembic:

```bash
sops -d secrets/cluster.secrets.yaml | envsubst > /tmp/runtime.env
export $(grep -v '^#' /tmp/runtime.env | xargs)
poetry run alembic upgrade head
```

## Проверка работоспособности

После запуска обоих сервисов можно убедиться в корректности ключевых сценариев через автоматические тесты:

```bash
# Проверка API бэкенда
pytest backend/app/tests/test_data_transformation.py

# Юнит- и интеграционные тесты фронтенда
cd frontend
npm test

# Пакетные проверки качества (линтеры, типизация, покрытие)
pre-commit run --all-files
pytest --cov=backend/app backend/app/tests
cd frontend && npm run lint && npm run test -- --coverage

# Контрактные и e2e тесты
pytest -m contract
npm run test:contracts
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e
```

Набор тестов бэкенда охватывает загрузку файлов, CRUD-операции с наборами данных и визуализациями, генерацию аналитики и логирование писем. Тесты Vitest проверяют вспомогательные утилиты фронтенда и работу API-обёрток.

Контрактные тесты Pact фиксируют схему обмена для `/api/v1/utils/send-email`, а снапшот OpenAPI (`backend/app/tests/snapshots/openapi_v1.json`) защищает общую спецификацию. E2E тест на Playwright запускается против любого стенда, базовый URL передаётся переменной `PLAYWRIGHT_BASE_URL`.

## Нагрузочные проверки

Базовый профиль на k6 (`tests/load/upload.js`) моделирует массовые загрузки файлов и контролирует SLO: `p(95) < 2.5s`, `error rate < 1%`. Запуск локально:

```bash
k6 run tests/load/upload.js -e K6_BASE_URL=http://localhost:8000
```

## Дополнительные материалы

- [Современные аналитические модули правоохранительных систем](docs/predictive_analytics_overview.md) — обзор подходов к мониторингу смещений в данных, построению графов знаний и использованию симуляторов предиктивного патрулирования.
- [Спецификации функций визуализации](docs/dashboard_feature_specs.md) — требования к конструктору дашбордов, библиотеке шаблонов и сравнению версий наборов данных.

## Новые возможности веб-приложения

- Раздел «Продвинутая аналитика» в интерфейсе предоставляет визуальные панели для мониторинга смещений, обзора графов знаний и моделирования сценариев предиктивного патрулирования.
- Планируется фасетный и семантический поиск с фильтрами по тегам, типам и владельцам, а также рекомендациями похожих наборов.
- В дорожной карте — детекторы трендов и выбросов с алертами для ключевых метрик витрины данных.
- Для ускорения онбординга появится автогенерация кратких описаний наборов данных и виджетов на основе профилей качества.

## Сборка фронтенда

```bash
# гарантируем наличие зависимостей (команду можно запускать повторно)
./scripts/install_frontend_deps.sh

cd frontend
npm run build
```

## Наблюдаемость

Проект поставляется с эндпоинтами `/metrics`, `/healthz` и `/readiness` для интеграции с
Prometheus и оркестраторами. Логи формируются в формате JSON и включают trace-id для связывания
с трассировками OpenTelemetry. Для отслеживания исключений используется Sentry.

## Версионирование и релизы

- Основной веткой служит `main`, релизы публикуются с помощью GitHub Release Drafter и следуют
  [Semantic Versioning](https://semver.org/lang/ru/). Для генерации черновиков релизов достаточно
  оформлять PR в формате [Conventional Commits](https://www.conventionalcommits.org/ru/v1.0.0/) —
  валидация заголовков выполняется отдельным GitHub Actions workflow.
- Версию можно обновить командой `./scripts/bump_version.py <major|minor|patch>` — она переносит
  список изменений из секции `Unreleased` в новую версию, убеждается, что она не пуста, и оставляет черновик пустым. Workflow
  публикации проверяет, что SemVer-тег совпадает со значением `__version__` в
  `backend/app/version.py`.
- История изменений фиксируется в [CHANGELOG.md](CHANGELOG.md). Перед публикацией релиза
  перенесите соответствующий блок из секции `Unreleased` в новую версию.

## Безопасность контейнеров

- Dockerfile бэкенда использует многоэтапную сборку: зависимости устанавливаются в промежуточном
  образе `python:3.11-slim`, после чего рабочая среда переносится в финальный минимальный образ
  [Distroless](https://github.com/GoogleContainerTools/distroless) с непривилегированным
  пользователем.
- Workflow `Container Security` собирает образ, формирует SBOM в формате SPDX с помощью Syft и
  подписывает артефакт Cosign (keyless). SBOM и подпись публикуются как артефакты пайплайна.

## CI/CD

GitHub Actions выполняют матричную сборку с Python 3.x и Node LTS. Workflow включает запуск
`pytest`, `npm test`, сборку фронтенда, линтеры (ruff, black, mypy, eslint, prettier,
typescript), публикацию отчётов покрытия и отдельный job для сканирования секретов (gitleaks
и TruffleHog). Дополнительно задействованы pre-commit-hooks, Dependabot, CodeQL и периодический
SCA workflow, который прогоняет `pip-audit` и `npm audit --production` по расписанию.

## Управление секретами

Секреты хранятся в зашифрованных файлах SOPS/age. Шаблон с описанием обязательных ключей —
`secrets/example.secrets.yaml`. Рабочий процесс:

1. Создайте файл `secrets/<environment>.secrets.yaml` из шаблона, зашифруйте его с помощью
   `sops -e --age <recipient> ...` и храните в Git.
2. В CI/CD пайплайнах расшифровывайте файл (например, `sops -d`), экспортируйте значения из
   секции `env` и передавайте в приложение.
3. Для ротации ключей используйте описанную в шаблоне схему: ежеквартальная проверка, мгновенная
   замена при инцидентах и обязательное документирование в runbook.

Подробности по процедурам ротации и интеграции с GitOps размещены в `docs/secrets.md`.

## Pre-commit

Установите и активируйте git-хуки, чтобы линтеры, типизация, gitleaks и smoke-тесты запускались до коммитов:

```bash
pip install pre-commit
pre-commit install --install-hooks
pre-commit install --hook-type pre-push
```

Хуки выполняют black, ruff, mypy для бэкенда, prettier и eslint для фронтенда, а также запускают юнит-тесты Vitest и pytest перед отправкой в удалённый репозиторий.

## Автоматизация в CI

Workflow `ci.yml` включает четыре независимых job'а: матричные проверки бэкенда на Python 3.10/3.11, фронтенда на Node 18/20, прогон pre-commit и отдельный `secret-scan`, который выполняет gitleaks и TruffleHog. Каждая сборка публикует отчёты покрытия (pytest, Vitest) как артефакты. Помимо CodeQL и Dependabot настроен расписной workflow `sca.yml`, запускающий `pip-audit` и `npm audit` еженедельно.
