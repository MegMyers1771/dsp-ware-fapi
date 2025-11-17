# dsp-ware-fapi
Реализация склада DSP на FastAPI

# Required files - Google Sheets
test-credentials.json
sheets_config.json

## Очередь синхронизации

Изменения айтемов автоматически отправляются в Google Sheets через фоновые задачи RQ. Перед запуском убедитесь, что доступен Redis (по умолчанию `redis://localhost:6379/0`). Для обработки задач запустите воркер:

```bash
RQ_REDIS_URL=redis://localhost:6379/0 rq worker sync
```

При необходимости можно задать название очереди (`RQ_QUEUE_NAME`) и таймаут (`RQ_DEFAULT_TIMEOUT`).


## Перед использованием
- SPREADSHEET_ID актуальной таблицы
- Сгенерировать credentials на google cloud
- расшарить сервис аккаунт на используемую таблицу
