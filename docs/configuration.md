# Configuration

Application settings are declared as typed configuration schemas with startup validation. If an environment variable carries an invalid value, the application exits immediately during boot with a clear error rather than failing during request execution.

To regenerate `.env.example` from schemas, run:

```bash
vpr app generate:config --overwrite
```

## General settings

| Variable           | Default                 | Description                                                                              |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `APP_BASE_URL`     | `http://localhost:3000` | Canonical public origin; relative URLs are resolved against this base.                   |
| `SERVER_HOST`      | `0.0.0.0`               | Network interface address for HTTP listener.                                             |
| `SERVER_PORT`      | `3000`                  | Port for HTTP listener.                                                                  |
| `API_DOCS_ENABLED` | `false`                 | Enable interactive Scalar API docs (`/api-docs`) and OpenAPI spec (`/api/openapi.json`). |

`APP_BASE_URL` must be an absolute `http` or `https` URL. Trailing paths are stripped automatically.

## Database settings

| Variable                | Default                      | Description                                                                 |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`          | `file:./storage/data/app.db` | Database connection string: local file path or remote Turso URI.            |
| `DATABASE_TOKEN`        | _(empty)_                    | Authentication token for remote Turso databases (required for remote URLs). |
| `DATABASE_AUTO_MIGRATE` | `false`                      | Automatically run pending database migrations on server startup.            |

`DATABASE_URL` supports two execution transports:

- **Local File (`file:` URI or relative/absolute path)**: Uses Turso's embedded SQLite engine in multi-process WAL mode. Several local processes (such as clustered server workers, health checks, and migration CLIs) safely share access to the same database file on disk. In-memory databases (`:memory:`) are rejected because separate processes cannot share transient memory.
- **Remote Database (`libsql://`, `turso://`, `https://`, `http://`)**: Connects over HTTP to a remote Turso database or `sqld` instance. `DATABASE_TOKEN` is mandatory. Startup performs an immediate pre-flight check to verify connectivity.

## Redis settings

| Variable       | Default                                   | Description                                                             |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `REDIS_ENABLE` | `false`                                   | Enable Redis for distributed caching and shared rate-limiting counters. |
| `REDIS_URL`    | `redis://default:securedb@localhost:6379` | Connection string for Redis. Features use distinct database indexes.    |

When `REDIS_ENABLE=true`, user lookups are cached in Redis database index `1`, and rate-limiting buckets are stored in database index `2`. If Redis becomes unreachable at runtime, cached lookups gracefully fall back to direct database reads.

## Logging settings

| Variable             | Default                  | Description                                                        |
| -------------------- | ------------------------ | ------------------------------------------------------------------ |
| `LOG_LEVEL`          | `Info`                   | Minimum log severity: `Debug`, `Info`, `Warn`, `Error`, `None`.    |
| `LOG_TRANSPORT`      | `console,file`           | Active sinks separated by commas: `console`, `file`, or `otlp`.    |
| `LOG_FILE`           | `storage/logs/app.jsonl` | File path for JSON-lines log sink when `file` is selected.         |
| `LOG_ROTATION`       | `daily`                  | File rotation interval: `hourly`, `daily`, `weekly`, or `monthly`. |
| `LOG_FILE_MAX_FILES` | `14`                     | Maximum number of rotated log files to retain (`0` retains all).   |
| `LOG_FORMAT`         | `pretty`                 | Console formatting style: `pretty` or `json`.                      |
| `LOG_FLUSH_INTERVAL` | `250`                    | Batch flush interval in milliseconds for log sinks.                |

## Security and cache settings

| Variable               | Default | Description                                                                     |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| `CORS_ENABLED`         | `true`  | Enable Cross-Origin Resource Sharing middleware.                                |
| `CORS_ALLOWED_ORIGINS` | `*`     | Comma-separated list of permitted origins. Empty or `*` permits all origins.    |
| `RATE_LIMIT_ENABLED`   | `true`  | Enforce token-bucket rate limiting on `/api/*` routes.                          |
| `RATE_LIMIT_MAX`       | `100`   | Maximum token bucket capacity per window (minimum `1`).                         |
| `RATE_LIMIT_WINDOW`    | `60000` | Rate limit window duration in milliseconds (default: 1 minute).                 |
| `TRUST_PROXY`          | `false` | Trusted reverse proxy configuration: `true`, `false`, or comma-separated CIDRs. |
| `CACHE_ENABLED`        | `true`  | Enable caching for user lookups.                                                |
| `CACHE_MAX_ENTRIES`    | `256`   | Maximum entries held in process memory cache.                                   |
| `CACHE_TTL`            | `30000` | Time-to-live for cached user records in milliseconds (default: 30 seconds).     |

Rate limiting uses a continuous-refill token bucket algorithm. Counters are stored in the database `rate_limits` table by default or in Redis when `REDIS_ENABLE=true`.

## Observability settings

| Variable                         | Default                 | Description                                                               |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `METRICS_ENABLED`                | `false`                 | Mount Prometheus scrape endpoint at `/metrics` and start runtime sampler. |
| `OTEL_SDK_DISABLED`              | `false`                 | Disable OpenTelemetry tracing and metric exports.                         |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | `http://localhost:4318` | Base URL for OTLP HTTP collector.                                         |
| `OTEL_EXPORTER_OTLP_HEADERS`     | development key         | Comma-separated authentication headers for collector.                     |
| `OTEL_SERVICE_NAME`              | `edgy`                  | Service identifier attached to exported traces and metrics.               |
| `OTEL_EXPORT_INTERVAL`           | `5000`                  | Batch export interval for telemetry in milliseconds.                      |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | `gzip`                  | OTLP payload compression: `gzip` or `none`.                               |

## Docker Compose stack settings

These environment variables configure the development services in `compose.yaml` (ClickStack, Redis, cAdvisor, Mailpit):

| Variable                       | Default                  | Description                                                                |
| ------------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `SERVER_PORT`                  | `3000`                   | Port mapped from host to application container.                            |
| `CLICKSTACK_UI_PORT`           | `8080`                   | Host port for ClickStack telemetry dashboard UI.                           |
| `OTLP_HTTP_PORT`               | `4318`                   | Host port for OTLP HTTP telemetry receiver.                                |
| `CLICKSTACK_INGESTION_KEY`     | `edgy-dev-ingestion-key` | Ingestion key accepted by the ClickStack collector.                        |
| `CLICKSTACK_DB_PASSWORD`       | `securedb`               | Password for internal ClickHouse and Redis services.                       |
| `CLICKSTACK_ACCESS_KEY`        | _(empty)_                | API access key for telemetry dashboard auto-provisioning.                  |
| `CLICKSTACK_ALERT_WEBHOOK_URL` | _(empty)_                | Destination webhook for alerts (omitted skips alert provisioning).         |
| `CLICKSTACK_RETENTION_DAYS`    | `30`                     | Days of telemetry data to retain in ClickHouse tables.                     |
| `APP_DISTROLESS_TAG`           | `debug-nonroot`          | Distroless base image tag (must include `/busybox` for runtime execution). |
| `CADVISOR_VERSION`             | `v0.52.1`                | Version tag for cAdvisor container metrics exporter.                       |
