# Локальный запуск на Windows (без `make`)

Этот пошаговый сценарий помогает поднять только фронтенд и бэкенд на Windows, если devcontainer недоступен.
Он покрывает подготовку зависимостей, запуск вспомогательных сервисов и проверку доступности.

## Предпосылки

- Docker Desktop с включённым WSL 2 (для Postgres/Redis/Unleash)
- Python 3.11+ и Node.js 20+ установлены в системе
- Git Bash/PowerShell/WSL для запуска команд

## 1. Клонирование и подготовка зависимостей

```bash
# из корня репозитория
python -m venv .venv
. .venv/Scripts/activate  # PowerShell: .venv\Scripts\Activate.ps1
pip install -r backend/app/requirements.txt

# фронтенд (можно повторять, если зависимости обновились)
./scripts/install_frontend_deps.sh
```

> Если `bash` недоступен, выполните `npm install` внутри каталога `frontend` вручную.

## 2. Запуск инфраструктуры

Backend ожидает Postgres, Redis и Unleash. Поднимите их в Docker (команда работает из корня репозитория):

```bash
docker compose up -d db redis unleash
```

Проверьте, что контейнеры поднялись: `docker compose ps`.

## 3. Запуск бэкенда

```bash
# можно выполнять из корня репозитория — шим добавит backend в PYTHONPATH автоматически
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> Если модуль `uvicorn` не найден, убедитесь, что виртуальное окружение активировано (`.venv\Scripts\activate`), либо вызывайте `python -m uvicorn ...`, как показано выше.
cd backend
python -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

> Если модуль `uvicorn` не найден, используйте вызов через Python из активированного виртуального окружения, как показано выше.

Проверьте, что API отвечает: откройте http://localhost:8000/docs в браузере. Если страница недоступна,
убедитесь, что порт 8000 не занят и что контейнеры `db`/`redis` запущены.

## 4. Запуск фронтенда

В новом терминале:

```bash
cd frontend
# При необходимости укажите адрес API (по умолчанию Vite берёт .env или VITE_API_BASE)
set VITE_API_BASE=http://localhost:8000  # PowerShell: $env:VITE_API_BASE="http://localhost:8000"
npm run dev -- --host
```

Откройте http://localhost:5173. Если видите «Не удаётся установить соединение», убедитесь, что бэкенд работает и
что переменная `VITE_API_BASE` указывает на `http://localhost:8000`.

## 5. Фоновые задачи (по желанию)

Для очередей Redis (воркер и AI compute provider) достаточно выполнить команды из корня репозитория — шим сам добавит `backend` в `PYTHONPATH`:

```bash
# RQ-воркер
python -m app.worker

# AI compute provider
Для очередей Redis (воркер и AI compute provider) запускайте из каталога `backend` или с `PYTHONPATH=backend`:

```bash
# RQ-воркер
cd backend
python -m app.worker

# AI compute provider
cd backend
python -m app.ai_compute.main
```

## 6. Остановка сервисов

```bash
# остановить фронтенд/бэкенд вручную (Ctrl+C в соответствующих окнах)
# остановить контейнеры Postgres/Redis/Unleash
cd <корень репозитория>
docker compose down
```

## Частые проблемы

- **`ModuleNotFoundError: No module named 'app'`** — убедитесь, что запускаете команды из корня клонa репозитория (там лежит папка `app/`-шим); она автоматически добавляет `backend` в `PYTHONPATH`.
- **`ModuleNotFoundError: No module named 'app'`** — запускайте команды из каталога `backend` или задайте `PYTHONPATH=backend`.
- **`getaddrinfo failed` при старте AI-провайдера** — Redis не запущен или недоступен по `redis://localhost:6379`.
- **Браузер пишет «Не удалось установить соединение»** — проверьте, что `uvicorn` слушает порт 8000 и переменная `VITE_API_BASE` указывает на правильный URL.
