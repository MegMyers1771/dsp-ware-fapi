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

## Запуск через Docker Compose
1. Скопируйте `.env.example` в `.env` и укажите секреты/пароли:
   - `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`
   - при необходимости скорректируйте `API_URL`, `AUTO_CREATE_TABLES`, `DEV_NO_CACHE`, `RQ_REDIS_URL`.
2. Соберите и поднимите сервисы: `docker compose up --build -d`.
3. Приложение будет доступно на `http://localhost:8000`, PostgreSQL — на `localhost:5432`, Redis — на `localhost:6379`, воркер очереди запустится как отдельный сервис `worker`.
4. Чтобы перезапустить только воркер: `docker compose restart worker`. Чтобы посмотреть его логи: `docker compose logs -f worker`.

### Веб-просмотр логов
Запускается сервис `logs` (Dozzle). Открыть в браузере: `http://localhost:9999` и выбрать контейнер `dsp-ware` (API) или любой другой из списка. Если нужно больше строк при загрузке, установите `DOZZLE_TAILSIZE` в `.env`.

### Nginx-прокси
Сервис `nginx` проксирует домен из `NGINX_SERVER_NAME` (по умолчанию `example.com`) на API. Порт хоста — `80`. Для работы с вашим доменом пропишите реальное имя в `.env` (`NGINX_SERVER_NAME=your-domain.tld`) и укажите нужный апстрим, если меняете схему/порт (`API_UPSTREAM`, по умолчанию `http://api:8000`). После `docker compose up -d` Nginx доступен на 80 порту и раздаёт API и статические файлы.

### История выдачи (XLSX)
Файл истории сохраняется внутри контейнера по пути `HISTORY_XLSX_PATH` (по умолчанию `/app/data/issue_history.xlsx`) и монтируется в том `historydata`, так что загрузка `/issues/export` отдаёт файл из контейнера. При необходимости задайте другой путь в `.env`.
