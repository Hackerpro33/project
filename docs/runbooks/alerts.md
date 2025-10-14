# Алёрты на ошибки и деградации

Этот документ описывает единые правила срабатывания алёртов по двум основным источникам наблюдаемости
Insight Sphere: Sentry (исключения и производительность) и стек Prometheus/Alertmanager
(системные и бизнес-метрики). Правила применяются для окружений `stage` и `prod`,
значение тега `environment` в алёртах должно совпадать с неймингом релиза
(`<service>@<semver>`), чтобы при разборе событий было понятно, какая версия
затронута.

## Матрица алёртов

| Категория              | Источник | Назначение | Порог | Канал оповещения |
|------------------------|----------|------------|-------|-------------------|
| Всплеск исключений API | Sentry   | Ошибки 5xx в бэкенде | >20 событий за 5 минут | `#alerts-backend`, PagerDuty «Backend Primary» |
| Ошибки фронтенда       | Sentry   | Unhandled exceptions в браузере | >30 событий за 10 минут | `#alerts-frontend` |
| Падение crash-free rate| Sentry   | Снижение стабильности релиза фронтенда | crash‑free <98 % в течение 15 минут | `#alerts-frontend`, e-mail release owner |
| Задержка аплоадов      | Prometheus | Нет успешных загрузок данных | `increase(insight_upload_total[30m]) == 0` | `#alerts-data` |
| Рост объёма загрузок   | Prometheus | Аномальный размер файлов | средний размер >250 МБ в 10 минут | `#alerts-data` |
| Readiness degraded     | Prometheus | Проба `/readiness` возвращает `degraded` | `probe_success == 0` 2 мин подряд | PagerDuty «Platform On-call» |
| Память процесса        | Prometheus | рост `process_resident_memory_bytes` | >1.5 ГБ 10 мин | `#alerts-platform` |

## Настройка Sentry

### Проекты и теги

* `insight-sphere-backend` — FastAPI сервис. Глобальные теги: `service=backend`,
  `runtime=python`, `release`, `environment`.
* `insight-sphere-frontend` — React SPA. Глобальные теги: `service=frontend`,
  `runtime=browser`.

Убедитесь, что SDK передаёт `environment` из переменных деплоя (`SENTRY_ENVIRONMENT`).
Для бэкенда релиз генерируется как `insight-sphere-backend@${__version__}` — значение
подтягивается из `backend/app/version.py`. Во фронтенде релиз совпадает с git‑SHA.

### Алёрт «Backend error spike»

* **Trigger**: `Issue frequency` >20 событий (level ≥ `error`) в течение 5 минут.
* **Filter**: `environment:stage OR environment:prod`, `service:backend`, `http.status:>=500`.
* **Actions**: Slack `#alerts-backend`, PagerDuty «Backend Primary».
* **Runbook**: ссылка на этот документ.

При срабатывании владелец смены обязан открыть последний релиз в Sentry, проверить
регрессии в разделе «Releases → Health» и либо зарезолвить проблему, либо включить
фича-флаг `upload_read_only` для изоляции трафика (см. `FeatureFlagProvider`).

### Алёрт «Frontend JS exceptions»

* **Trigger**: `Issue frequency` >30 событий уровня `error` за 10 минут.
* **Filter**: `service:frontend`, исключить `mechanism:instrumentation` (ложные
  срабатывания от расширений браузера).
* **Actions**: Slack `#alerts-frontend`. Дополнительно — e-mail автору релиза
  (берётся из поля `assignedTo` при релизе).

Дежурный проверяет вкладку «Replay» и фильтр по `release`. Если ошибка связана с
конкретным виджетом дашборда, откатываем через фича-флаг `advanced_analytics`.

### Алёрт «Crash-free rate drop»

* **Trigger**: `Crash Free Sessions` <98 % три срабатывания подряд.
* **Filter**: `environment:prod`, `service:frontend`.
* **Actions**: Slack `#alerts-frontend`, e-mail владельцу релиза.

Проверить отчёт «Releases → Health», сопоставить время падения crash‑free rate с
развёртыванием и нагрузочными событиями. При необходимости заморозить деплойments,
написав в канал `#release-management`.

### Мониторы Sentry для деградаций

* **Background tasks** — Cron monitor `refresh_quality_metrics` (см. расписание в
  Celery beat). Триггер: выполнение дольше 15 минут или пропуск запуска.
* **OTel span duration** — Performance monitor на спан `datasets.upload` с
  порогом p95 <4 сек. При превышении — Slack `#alerts-backend`.

## Alertmanager

### Источники метрик

Бэкенд публикует `/metrics` с помощью `prometheus-client`. Доступны следующие
метрики, используемые в правилах:

* `insight_upload_total` — счётчик успешных загрузок.
* `insight_upload_size_bytes_bucket`/`_sum` — распределение размера файлов.
* `process_resident_memory_bytes`, `process_cpu_seconds_total` — стандартные метрики
  Python-процесса.
* `python_gc_objects_collected_total` — контроль GC.

Проба `/readiness` мониторится через blackbox‑экспортёр (`module: http_2xx`).
В Helm-чарте уже включён `ServiceMonitor`, достаточно добавить `additionalScrapeConfigs`
в Prometheus для blackbox‑экспортёра.

### Готовые правила

Файл `deploy/monitoring/alert-rules/insight-sphere.rules.yaml` уже содержит готовый
`PrometheusRule` с описанными выше условиями для backend и frontend. Его можно применить
на кластер, где установлен Prometheus Operator:

```bash
kubectl apply -f deploy/monitoring/alert-rules/insight-sphere.rules.yaml
```

Файл включает `runbook_url`, указывающий на этот документ, и размечен лейблами
`app.kubernetes.io/*` для согласованности с остальными манифестами. Если в Helm-чарте
используется `additionalRulesMounts`, достаточно смонтировать каталог
`deploy/monitoring/alert-rules` и указать его в `values.yaml`.

Экспортёр Sentry (например, официальный `sentry-metrics-exporter`) должен
предоставлять метрики `sentry_errors_total`, `sentry_sessions_started_total` и
`sentry_sessions_crashed_total`, иначе алёрты `FrontendExceptionSpike` и
`FrontendCrashFreeRateDrop` будут пассивными.

### Alertmanager конфигурация

Маршрутизация инцидентов вынесена в `deploy/monitoring/alertmanager/alertmanager.yml`.
Её можно проверить и применить следующими командами:

```bash
amtool check-config deploy/monitoring/alertmanager/alertmanager.yml
kubectl create configmap alertmanager-insight-sphere \
  --from-file=alertmanager.yml=deploy/monitoring/alertmanager/alertmanager.yml \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Маршрутизация Alertmanager

Ключевые блоки конфигурации Alertmanager, на которые стоит обратить внимание при
эксплуатации:

```yaml
route:
  receiver: default
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 2h
  routes:
    - matchers: ['severity = critical', 'service = backend']
      receiver: pagerduty-backend
    - matchers: ['service = backend', 'severity =~ "(high|medium)"']
      receiver: slack-backend
    - matchers: ['service = frontend']
      receiver: slack-frontend
receivers:
  - name: default
    slack_configs:
      - channel: '#observability'
        send_resolved: true
  - name: pagerduty-backend
    pagerduty_configs:
      - routing_key: ${PAGERDUTY_ROUTING_KEY}
        severity: error
  - name: slack-backend
    slack_configs:
      - channel: '#alerts-backend'
        username: 'insight-sphere'
        icon_emoji: ':rotating_light:'
        send_resolved: true
  - name: slack-frontend
    slack_configs:
      - channel: '#alerts-frontend'
        send_resolved: true
inhibit_rules:
  - source_matchers:
      - severity = critical
    target_matchers:
      - severity = medium
      - service = backend
    equal:
      - alertname
      - service
```

## Процесс реагирования

1. **Классифицировать алёрт.** Для Sentry — изучить графики Issue/Performance,
   для Prometheus — открыть граф «Expression» в Alertmanager/Grafana.
2. **Создать инцидент.** Если серьёзность `critical` — завести тикет в Incident
   Response борде и назначить владельца.
3. **Коммуникация.** Зафиксировать статус в `#status-page` и при необходимости
   отправить обновление пользователям.
4. **Митигировать.** Возможные шаги: включение `upload_read_only`, масштабирование
   реплик через `kubectl scale`, откат релиза в ArgoCD/Helm, переключение фича-флагов.
5. **Пост‑мортем.** После закрытия инцидента обновить Runbook (при необходимости) и
   проверить, что в Sentry зафиксировано `Resolved in Next Release`.

## Контроль качества правил

* Раз в квартал проверять, что каналы оповещения актуальны.
* После каждого релиза проверять, что тег `release` корректно заполняется во всех
  средах и в Sentry, и в метриках Prometheus (`environment`/`release`).
* Результаты проверки фиксировать в Confluence страничке «Observability Review».
