# Провайдер вычислений для ИИ-задач

## Обзор

Провайдер вычислений обеспечивает единообразный интерфейс для запуска локальных моделей ИИ
на CPU и GPU. Он управляет пулом исполнителей, следит за доступностью ресурсов и
инструментирует задачи для последующего анализа производительности. Ключевые требования:

- поддержка гетерогенных воркеров (CPU, CUDA совместимые GPU);
- честная очередь задач с приоритезацией GPU-запросов;
- ограничение потребления видеопамяти и graceful degradation на CPU;
- автоматический сбор метрик и профилей выполнения.

Провайдер разворачивается как независимый сервис, общающийся с основным API по gRPC. Для
управления конфигурацией используется `ai_compute.toml`, который хранится рядом с
приложением и загружается при старте сервиса.

## Архитектура

```
flowchart LR
    subgraph API[Insight Sphere API]
        QueueAPI[Task Dispatcher]
    end
    subgraph Provider[AI Compute Provider]
        Scheduler
        subgraph Pools
            CPUExecutors[CPU Pool]
            GPUExecutors[GPU Pool]
        end
        Profiler
    end
    Redis[(Redis Streams)]
    Prometheus[(Prometheus)]

    QueueAPI -->|enqueue| Redis
    Scheduler -->|claim job| Redis
    Scheduler --> CPUExecutors
    Scheduler --> GPUExecutors
    CPUExecutors --> Profiler
    GPUExecutors --> Profiler
    Profiler -->|export metrics| Prometheus
    Prometheus -->|scrape| Grafana
```

- **Task Dispatcher** (существующий FastAPI слой) публикует задания в поток `ai:jobs`.
- **Scheduler** читает задания, выбирает очередь (CPU/GPU) и управляет планированием.
- **Executors** выполняют задачи в отдельных процессах, управляют ресурсами и сообщают о
  состоянии через Redis и Prometheus.
- **Profiler** агрегирует показатели производительности, хранит отчёты и инициирует
  автоматический сбор трасс.

## Очереди и планировщик CUDA-задач

1. Поступающие задания описываются JSON-пакетом:
   ```json
   {
     "id": "uuid",
     "model": "forecast-v2",
     "priority": "gpu",
     "input_uri": "s3://uploads/42.parquet",
     "expected_vram_mb": 2048,
     "deadline_s": 120
   }
   ```
2. Все задания попадают в общий поток Redis Streams (`ai:jobs`).
3. Планировщик распределяет их по внутренним очередям:
   - **GPU queue** — задачи с `priority: "gpu"` и валидным профилем видеопамяти;
   - **CPU queue** — задачи с `priority: "cpu"` или задачами GPU, которые не смогли
     получить квоту VRAM.
4. Для GPU очереди используется алгоритм **weighted fair queuing**: вес определяется
   важностью задачи (`priority_weight`) и оценкой времени выполнения. Это предотвращает
   starvation CPU-задач.
5. При превышении числа одновременных GPU задач выставляется статус `waiting_gpu`, который
   может отображаться на фронтенде. После освобождения ресурсов задача автоматически
   переведётся в `running`.

## Ограничение VRAM и управление ресурсами

- Сервис периодически опрашивает `nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader`.
- Для каждой модели в `ai_compute.toml` хранится профиль потребления (`baseline_vram_mb`,
  `peak_vram_mb`).
- При постановке задачи планировщик рассчитывает требуемую VRAM:
  ```
  required = max(baseline_vram_mb, expected_vram_mb) * safety_factor
  ```
  где `safety_factor` по умолчанию 1.15.
- Если доступной VRAM недостаточно, задача возвращается в очередь с
  экспоненциальной задержкой (`backoff_s = min(60, 2^attempt)`). После трёх неудачных
  попыток задача помечается как `degraded` и направляется в CPU очередь.
- CPU исполнители могут использовать оптимизированные версии моделей (квантованные весы,
  пониженная размерность), которые описаны в конфигурации (`cpu_variant`).

## Профилирование

Профилирование включает три уровня детализации:

1. **Быстрые метрики** — время ожидания в очереди, длительность выполнения,
   фактическое потребление VRAM/CPU/памяти, количество вызовов CUDA kernel.
   Экспортируются в Prometheus через `/metrics`.
2. **Сессии PyTorch Profiler** — активируются для каждой n-й задачи (настраивается
   параметром `profiling.sample_rate`). Результаты сохраняются в
   `uploads/profiler/<job_id>.json` и доступны через API `GET /api/v1/ai/jobs/{id}/profile`.
3. **Трассировки Nsight Systems** — включаются ручным флагом `profiling.nsight_enabled`.
   Сервис запускает `nsys profile` при старте задачи и выгружает отчёт (`.qdrep`) в
   защищённое хранилище.

Профайлер также следит за `cudaLaunchKernel` ошибками и автоматически помечает задачу
статусом `failed` с приложенным логом.

## Конфигурация (`ai_compute.toml`)

```toml
[general]
redis_url = "redis://redis:6379/0"
stream_name = "ai:jobs"
max_gpu_workers = 2
max_cpu_workers = 4
safety_factor = 1.15

[profiling]
sample_rate = 0.1
nsight_enabled = false

[[models]]
name = "forecast-v2"
baseline_vram_mb = 2048
peak_vram_mb = 4096
cpu_variant = "forecast-v2-int8.pt"

[[models]]
name = "insight-llm"
baseline_vram_mb = 6144
peak_vram_mb = 8192
cpu_variant = "insight-llm-gguf.q4_0"
```

- `max_gpu_workers` ограничивает одновременные процессы с CUDA.
- `max_cpu_workers` задаёт размер пула CPU.
- `safety_factor` определяет запас VRAM для непредвиденных всплесков.
- Секция `models` позволяет настраивать индивидуальные профили.

## Интеграция с API

- `POST /api/v1/ai/jobs` — ставит задачу в очередь, возвращает идентификатор и
  прогнозируемое время ожидания.
- `GET /api/v1/ai/jobs/{id}` — статус (`queued`, `waiting_gpu`, `running`,
  `degraded`, `finished`, `failed`).
- `POST /api/v1/ai/jobs/{id}/cancel` — попытка отмены выполняющейся задачи.
- `GET /api/v1/ai/jobs/{id}/profile` — скачивание профиля (при наличии).

Фронтенд отображает отдельные индикаторы для состояний `waiting_gpu` и `degraded`, чтобы
пользователи понимали, что задача временно выполняется на CPU.

## Операционные практики

- Алерты Prometheus:
  - `GpuJobWaitSeconds_p95 > 60` — очередь GPU переполнена.
  - `GpuMemoryExhausted` — свободной VRAM < 10% в течение 5 минут.
  - `AiJobFailures_rate > 5%` — массовые ошибки выполнения.
- Регулярный аудит `uploads/profiler` и отчётов Nsight.
- Лимиты Kubernetes (GPU requests/limits) отражают `max_gpu_workers` и количество доступных
  GPU на узле.
- Обновления драйверов и CUDA toolkit проходят через staging окружение с нагрузочным тестом,
  который воспроизводит пик использования VRAM.

## План развития

- Поддержка нескольких GPU на задачу (model parallelism) с блокировкой NVLink.
- Интеграция с Slurm/Run:AI для распределённых кластеров.
- Автоматическое масштабирование GPU узлов на основе метрик очереди.
