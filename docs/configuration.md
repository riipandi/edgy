# Application configuration

The application reads optional environment variables through Effect `Config`, validated at startup.
Values are grouped by app, server, database, logging, security, cache, observability, and docs.
Invalid values fail during startup rather than surfacing on the first request. Durations use whole
milliseconds.

Run `vpr app generate:config` to create `.env.example` from the same declarations. The generator
redacts secret defaults, refuses real `.env` files, and requires confirmation before replacing a
different existing output file.

## Example file

`.env.example` lists every variable with its default and a one-line description. It is generated
from the configuration itself, so it is always complete:

```bash
vpr app generate:config               # create .env.example (never replaces an existing, different file)
vpr app generate:config --overwrite   # replace it after a confirmation (--force skips the prompt)
vpr app generate:config --check       # fail if the file is out of date
cp .env.example .env.local            # then change only what you need
```

## General Configuration

| Variable           | Default                 | Meaning                                                       |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| `API_DOCS_ENABLED` | `false`                 | Expose the OpenAPI document and the Scalar API reference.     |
| `APP_BASE_URL`     | `http://localhost:3000` | Public origin; relative request URLs are resolved against it. |
| `SERVER_HOST`      | `0.0.0.0`               | HTTP listener address                                         |
| `SERVER_PORT`      | `3000`                  | HTTP listener port                                            |

Set `APP_BASE_URL` to the origin users reach the application on. It must be an absolute `http` or
`https` URL; only the origin is kept, so a trailing path is dropped and an invalid value fails
startup — empty and whitespace-only values fail the same way. (Setting the variable to an empty
string in the process environment counts as unset, so the default applies there.) Behind a reverse
proxy, use the public origin rather than the bind address.

When `API_DOCS_ENABLED` enabled, the server serves the Scalar API reference at `/api-docs` and the OpenAPI
document at `/api/openapi.json`. Keep it off unless the API is meant to be public.

## Database

| Variable                | Default                                   | Meaning                                                                                       |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `file:./storage/data/app.db`              | Local database file, or the URL of a remote Turso database.                                   |
| `DATABASE_TOKEN`        | empty                                     | Turso auth token; required by a remote URL and ignored by a local one.                        |
| `DATABASE_AUTO_MIGRATE` | `false`                                   | Apply migrations before the server starts. The `--auto-migrate` serve flag also enables this. |
| `REDIS_ENABLE`          | `false`                                   | Use Redis for the rate-limit and cache stores.                                                |
| `REDIS_URL`             | `redis://default:securedb@localhost:6379` | Redis connection URL; each feature uses its own database.                                     |

`DATABASE_URL` is one variable for both transports. A `file:` URI is a local database, and its path
is read the way RFC 8089 defines it: `file:/data/app.db`, `file:///data/app.db` and
`file://localhost/data/app.db` name the same file, `file:./storage/app.db` is relative to the
working directory, and a percent-encoded path is decoded. A bare path such as `./storage/app.db`
works as a convenience. `file://otherhost/data/app.db` is refused, because a local engine cannot
open another machine's file, and `:memory:` is refused too — an in-memory database cannot be shared
with the healthcheck probe or a migration run. A remote database is named by `libsql://`,
`turso://`, `https://` or `http://` and requires `DATABASE_TOKEN`; a remote URL without a token
fails at startup, naming the variable, rather than at the first query. Setting `DATABASE_TOKEN`
next to a local URL logs one warning and ignores it. An `http://` URL works — a local `sqld` on
loopback has no TLS — but one warning names the variable and the unencrypted token.

The local file is created next to its directory (mode `0775`) and narrowed to `0600`, and so is
every sidecar the engine writes beside it (`-wal` for the write-ahead log, `-tshm` for shared
memory), which hold uncommitted rows. Foreign keys are enforced and the journal mode is WAL. Every
process of the application opens the file in multi-process WAL mode, so the healthcheck probe and a
migration run can read and write while the server holds the same database; a tool outside this
application (`sqlite3`, the `turso` CLI) opening that file without the same option conflicts with
it.

A remote database is verified when it is acquired — one `select 1` bounded by a 5-second query
timeout — so a wrong host or a revoked token fails the startup, naming the cause, instead of
surfacing at the first request. Every remote request carries the same 5-second bound; a stalled
connection cannot hold the process forever. A local URL is not probed.

Database access is exposed through an Effect service. It owns the Kysely connection lifecycle and
returns typed `DatabaseError` failures. Migrations and seeders use the same service, over either
transport.

One connection serves every feature that needs Redis. Features are separated by database index
rather than by URL: the cache uses database `1` and the rate limiter database `2`, so keys never
collide and a deployment configures a single server. `REDIS_URL` accepts `redis://` and `rediss://`
URLs; a database index written in the URL is replaced by the feature's own index. Set
`REDIS_ENABLE=true` only when Redis is reachable — the process connects at startup, and an
unreachable server fails the layers that depend on it.

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

| Variable               | Default | Meaning                                                                                |
| ---------------------- | ------- | -------------------------------------------------------------------------------------- |
| `CACHE_ENABLED`        | `true`  | Cache user lookups.                                                                    |
| `CACHE_MAX_ENTRIES`    | `256`   | Maximum entries held by the user lookup cache.                                         |
| `CACHE_TTL`            | `30000` | Cache entry lifetime in milliseconds.                                                  |
| `CORS_ALLOWED_ORIGINS` | `*`     | Comma-separated absolute origins. Empty allows any origin.                             |
| `CORS_ENABLED`         | `true`  | Answer cross-origin requests.                                                          |
| `RATE_LIMIT_ENABLED`   | `true`  | Enable API rate limiting.                                                              |
| `RATE_LIMIT_MAX`       | `100`   | Requests allowed for a client during one window; must be at least `1`.                 |
| `RATE_LIMIT_WINDOW`    | `60000` | Rate-limit window in milliseconds.                                                     |
| `TRUST_PROXY`          | `false` | Proxies that may set `X-Forwarded-For`: `true`, `false`, or comma-separated IPs/CIDRs. |

Rate limiting applies only to the API routes. Its fixed-window counters live in the `rate_limits`
database table by default, or in Redis when `REDIS_ENABLE=true`, which lets several instances share
the limit. A store that cannot be read answers `503` instead of letting the request through
unthrottled. `TRUST_PROXY` controls which reverse proxies may set the client address through
`X-Forwarded-For` or `X-Real-IP`; requests that do not come through a trusted proxy are keyed by their
own address, and a spoofed forwarded header from an untrusted peer is ignored. Cached user lookups
live in process memory by default, or in Redis when `REDIS_ENABLE=true`; a failed lookup is never
cached.

`CORS_ENABLED` defaults to `true` and `CORS_ALLOWED_ORIGINS` defaults to empty, which allows any
origin. The server echoes the caller's origin and allows credentials on that origin. This is safe
only while the API carries no authentication: with no cookie or session token to steal, a cross-site
caller reads the same public data as any other client. Set `CORS_ALLOWED_ORIGINS` to the origins you
serve before the API gains an auth cookie, otherwise any site a signed-in user visits can read the
API with that user's credentials.

## Observability

| Variable                         | Default                 | Meaning                                                                                                  |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `METRICS_ENABLED`                | `false`                 | Register the Effect Prometheus endpoint at `/metrics` and run the runtime metrics sampler that feeds it. |
| `OTEL_SDK_DISABLED`              | `false`                 | Disable OTLP trace and metric export.                                                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | `http://localhost:4318` | OTLP/HTTP collector base URL.                                                                            |
| `OTEL_EXPORTER_OTLP_HEADERS`     | development header      | Comma-separated `key=value` request headers. Treat this as a secret.                                     |
| `OTEL_SERVICE_NAME`              | `edgy`                  | Service name attached to telemetry.                                                                      |
| `OTEL_EXPORT_INTERVAL`           | `5000`                  | Export interval in milliseconds.                                                                         |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | `gzip`                  | OTLP compression: `gzip` or `none`.                                                                      |

Traces and metrics use Effect's OTLP exporters. Logs use OTLP when `LOG_TRANSPORT` includes `otlp`.
One-shot CLI commands disable OTLP export by default so they do not wait on a collector during
shutdown. Set `OTEL_SDK_DISABLED=false` explicitly if a one-shot command should export telemetry.

The `/metrics` endpoint is unauthenticated by design: it is meant to be scraped from inside the
network, and access control belongs to the reverse proxy or the scrape configuration. Keep
`METRICS_ENABLED` off on deployments that expose the port directly.

## Compose observability stack

The compose stack (`docker compose up --detach`) runs the application next to its observability
and support services: ClickStack (telemetry UI, ClickHouse, collector), the app, cAdvisor, Redis,
the Redis exporter, and Mailpit. These variables configure the stack and are not part of the
generated application configuration:

| Variable                             | Default                               | Meaning                                                                                     |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `SERVER_PORT`                        | `3000`                                | Host port the compose app publishes on `127.0.0.1`.                                         |
| `CLICKSTACK_UI_PORT`                 | `8080`                                | Host port for the ClickStack UI.                                                            |
| `OTLP_HTTP_PORT`                     | `4318`                                | Host port for OTLP/HTTP ingestion (host-run processes only; the app uses the internal URL). |
| `CLICKSTACK_INGESTION_KEY`           | `edgy-dev-ingestion-key`              | OTLP ingestion key the collector accepts.                                                   |
| `CLICKSTACK_DB_PASSWORD`             | `securedb`                            | ClickHouse password used by the stack and the app's Redis/ClickHouse wiring.                |
| `CLICKSTACK_ACCESS_KEY`              | empty                                 | Access key for the provisioner's API calls; empty falls back to the password login flow.    |
| `CLICKSTACK_ALERT_WEBHOOK_URL`       | empty                                 | Webhook URL that receives the two alert channels. Leave empty to skip alert provisioning.   |
| `CLICKSTACK_RETENTION_DAYS`          | `30`                                  | Days of telemetry kept; the provisioner rewrites each table's TTL when it differs.          |
| `HYPERDX_EMAIL` / `HYPERDX_PASSWORD` | `admin@example.com` / `@Password123!` | First-run ClickStack admin login the provisioner uses.                                      |
| `APP_DISTROLESS_TAG`                 | `debug-nonroot`                       | Distroless variant for the compose app build (see the note below).                          |
| `CADVISOR_VERSION`                   | `v0.52.1`                             | cAdvisor image tag.                                                                         |

Set `CLICKSTACK_ALERT_WEBHOOK_URL` to a webhook endpoint to have the provisioner create the
`edgy alerts` channel and apply the two alerts shipped in `container/clickstack/alerts`: a
no-spans alert (telemetry from the application has stopped for 10 minutes) and a collector alert
(refused or failed exports above zero). With the key unset, dashboards still provision but no
alerting exists — a silent stack and a broken stack look the same, which is exactly what the
`Telemetry freshness` tile in the Application SLI dashboard is for.

`APP_DISTROLESS_TAG` defaults to `debug-nonroot` because the container build bakes the entry's shebang
as `#!/busybox/env node` (`ENV_BINARY_PATH` in the Dockerfile), and only the `debug` distroless variants
ship `/busybox`. The plain `nonroot` tag ships neither `/busybox` nor `/usr/bin/env`, so an image built
from it starts with `exec /app/entry.js failed: No such file or directory`. Use `debug-nonroot` for
every local and development container build.

`CLICKSTACK_RETENTION_DAYS` (default `30`) is how long telemetry is kept. ClickHouse enforces it as
a table TTL, and the provisioner rewrites every `otel_*` and `hyperdx_*` table's TTL at start when
it differs from the configured value — so changing the variable and restarting applies it, and a
table the image recreates with its own 30-day default is healed on the next start. When the
configured window drops toward what the "Days of headroom" tile projects, the disk, not the
retention, is the next thing to revisit.
