# Application configuration

The application reads optional environment variables through Effect `Config`. Values are grouped by
server, database, logging, security, cache, and observability. Invalid values fail during startup
rather than surfacing on the first request. Durations use whole milliseconds.

Run `pnpm app config:generate` to render `.env.example` from the same declarations. The generator
redacts secret defaults, refuses real `.env` files, and requires confirmation before replacing a
different existing output file.

## Server

| Variable | Default   | Meaning               |
| -------- | --------- | --------------------- |
| `HOST`   | `0.0.0.0` | HTTP listener address |
| `PORT`   | `3000`    | HTTP listener port    |

## Database

| Variable                | Default               | Meaning                                                                                       |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_DRIVER`       | `sqlite`              | SQLite is the supported driver.                                                               |
| `DATABASE_PATH`         | `storage/data/app.db` | SQLite file path; use `:memory:` for an in-memory database.                                   |
| `DATABASE_AUTO_MIGRATE` | `false`               | Apply migrations before the server starts. The `--auto-migrate` serve flag also enables this. |

Database access is exposed through an Effect service. It owns the Kysely connection lifecycle and
returns typed `DatabaseError` failures. Migrations and seeders use the same SQLite-backed service.

## Logging

| Variable             | Default                  | Meaning                                                       |
| -------------------- | ------------------------ | ------------------------------------------------------------- |
| `LOG_LEVEL`          | `Info`                   | Minimum log level.                                            |
| `LOG_TRANSPORT`      | `console`                | Comma-separated sinks: `console`, `file`, and/or `otlp`.      |
| `LOG_FILE`           | `storage/logs/app.jsonl` | File sink path; used when `file` is selected.                 |
| `LOG_ROTATION`       | `daily`                  | File period: `hourly`, `daily`, `weekly`, or `monthly` (UTC). |
| `LOG_FILE_MAX_FILES` | `14`                     | Rotated files to keep; `0` keeps all.                         |
| `LOG_FORMAT`         | `pretty`                 | Console output format: `pretty` or `json`.                    |
| `LOG_FLUSH_INTERVAL` | `250`                    | Console and file sink batch window in milliseconds.           |

The default console logger keeps local output readable. Select `json` for structured console output.
The file sink writes JSON lines, rotates on UTC period boundaries, and flushes when the logger scope
closes. `LOG_TRANSPORT` accepts only the listed sinks; unknown or empty comma-separated entries fail
configuration parsing.

## Security and cache

| Variable             | Default | Meaning                                                                |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| `RATE_LIMIT_ENABLED` | `true`  | Enable API rate limiting.                                              |
| `RATE_LIMIT_MAX`     | `100`   | Requests allowed for a client during one window; must be at least `1`. |
| `RATE_LIMIT_WINDOW`  | `60000` | Rate-limit window in milliseconds.                                     |
| `CACHE_ENABLED`      | `true`  | Cache user lookups.                                                    |
| `CACHE_TTL`          | `30000` | Cache entry lifetime in milliseconds.                                  |
| `CACHE_MAX_ENTRIES`  | `256`   | Maximum entries held by the user lookup cache.                         |

The cache and rate limiter are in-memory and process-local. They are suitable for a single server
instance; they do not coordinate state between replicas. Rate limiting applies only to the API
routes and keys requests by the socket's remote address. It ignores `X-Forwarded-For` because the
server has no trusted-proxy configuration; clients behind the same proxy therefore share one key.

## Observability

| Variable                         | Default                 | Meaning                                                              |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `METRICS_ENABLED`                | `false`                 | Register the Effect Prometheus endpoint at `/metrics`.               |
| `OTEL_SDK_DISABLED`              | `false`                 | Disable OTLP trace and metric export.                                |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | `http://localhost:4318` | OTLP/HTTP collector base URL.                                        |
| `OTEL_EXPORTER_OTLP_HEADERS`     | development header      | Comma-separated `key=value` request headers. Treat this as a secret. |
| `OTEL_SERVICE_NAME`              | `edgy`                  | Service name attached to telemetry.                                  |
| `OTEL_EXPORT_INTERVAL`           | `5000`                  | Export interval in milliseconds.                                     |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | `gzip`                  | OTLP compression: `gzip` or `none`.                                  |

Traces and metrics use Effect's OTLP exporters. Logs use OTLP when `LOG_TRANSPORT` includes `otlp`.
One-shot CLI commands disable OTLP export by default so they do not wait on a collector during
shutdown. Set `OTEL_SDK_DISABLED=false` explicitly if a one-shot command should export telemetry.
