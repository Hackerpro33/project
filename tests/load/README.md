# K6 load profile

Скрипт `upload.js` моделирует массовые загрузки больших файлов в API `/api/v1/upload`.

## Запуск

```bash
k6 run --vus 10 --duration 3m tests/load/upload.js \
  -e K6_BASE_URL=http://localhost:8000
```

## SLO

- **Latency**: `p(95) < 2.5s`
- **Error rate**: `< 1%`

Метрики фиксируются внутри сценария как `thresholds`. Скрипт использует файл `fixtures/sample.csv`
(5 строк) в качестве нагрузки; замените содержимое при моделировании более тяжёлых сценариев.
