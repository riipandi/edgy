# Application configuration

The application reads optional environment variables through Effect `Config`. Values are grouped by
app, server, database, logging, security, cache, observability, and docs. Invalid values fail during
startup rather than surfacing on the first request. Durations use whole milliseconds.

Run `vpr app config:generate` to render `.env.example` from the same declarations. The generator
redacts secret defaults, refuses real `.env` files, and requires confirmation before replacing a
different existing output file.

## App

| Variable       | Default                 | Meaning                                                       |
| -------------- | ----------------------- | ------------------------------------------------------------- |
| `APP_BASE_URL` | `http://localhost:3000` | Public origin; relative request URLs are resolved against it. |

Set `APP_BASE_URL` to the origin users reach the application on. It must be an absolute `http` or
`https` URL; only the origin is kept, so a trailing path is dropped and an invalid value fails
startup. Behind a reverse proxy, use the public origin rather than the bind address.

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

| Variable               | Default                  | Meaning                                                                                |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `RATE_LIMIT_ENABLED`   | `true`                   | Enable API rate limiting.                                                              |
| `RATE_LIMIT_STORE`     | `database`               | Where rate-limit windows live: the database, or a shared Redis.                        |
| `RATE_LIMIT_REDIS_URL` | `redis://localhost:6379` | Redis connection URL for the redis rate-limit store. Treat this as a secret.           |
| `RATE_LIMIT_MAX`       | `100`                    | Requests allowed for a client during one window; must be at least `1`.                 |
| `RATE_LIMIT_WINDOW`    | `60000`                  | Rate-limit window in milliseconds.                                                     |
| `TRUST_PROXY`          | `false`                  | Proxies that may set `X-Forwarded-For`: `true`, `false`, or comma-separated IPs/CIDRs. |
| `CORS_ENABLED`         | `true`                   | Answer cross-origin requests.                                                          |
| `CORS_ALLOWED_ORIGINS` | empty                    | Comma-separated absolute origins. Empty allows any origin.                             |
| `CACHE_ENABLED`        | `true`                   | Cache user lookups.                                                                    |
| `CACHE_STORAGE`        | `memory`                 | Where cache entries live: in process memory, or shared Redis.                          |
| `CACHE_REDIS_URL`      | `redis://localhost:6379` | Redis connection URL for the redis cache storage. Treat this as a secret.              |
| `CACHE_TTL`            | `30000`                  | Cache entry lifetime in milliseconds.                                                  |
| `CACHE_MAX_ENTRIES`    | `256`                    | Maximum entries held by the user lookup cache.                                         |

Rate limiting applies only to the API routes. Its fixed-window counters live in the configured store:
the `rate_limits` database table, or Redis for deployments with several instances sharing the limit.
A store that cannot be read answers `503` instead of letting the request through unthrottled.
`TRUST_PROXY` controls which reverse proxies may set the client address through `X-Forwarded-For` or
`X-Real-IP`; requests that do not come through a trusted proxy are keyed by their own address, and a
spoofed forwarded header from an untrusted peer is ignored. Cached user lookups live in process
memory or in Redis (`CACHE_STORAGE=redis`); a failed lookup is never cached.

## CORS

`CORS_ENABLED` defaults to `true` and `CORS_ALLOWED_ORIGINS` defaults to empty, which allows any
origin. The server echoes the caller's origin and allows credentials on that origin. This is safe
only while the API carries no authentication: with no cookie or session token to steal, a cross-site
caller reads the same public data as any other client. Set `CORS_ALLOWED_ORIGINS` to the origins you
serve before the API gains an auth cookie, otherwise any site a signed-in user visits can read the
API with that user's credentials.

## Docs

| Variable           | Default | Meaning                                                   |
| ------------------ | ------- | --------------------------------------------------------- |
| `API_DOCS_ENABLED` | `false` | Expose the OpenAPI document and the Scalar API reference. |

When enabled, the server serves the Scalar API reference at `/api-docs` and the OpenAPI document at
`/api/openapi.json`. Keep it off unless the API is meant to be public.

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

The `/metrics` endpoint is unauthenticated by design: it is meant to be scraped from inside the
network, and access control belongs to the reverse proxy or the scrape configuration. Keep
`METRICS_ENABLED` off on deployments that expose the port directly.
