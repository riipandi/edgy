# Application Configuration

All configuration is read from environment variables, validated at startup. A value that is present
but invalid (a non-numeric `PORT`, an unknown `DATABASE_DRIVER`) stops the process with an error that
names the variable, instead of failing on the first request.

Every variable is optional. The defaults suit local development: they point at the services of
`pnpm compose:up` (ClickStack for telemetry, Valkey for the shared rate limit), so a fresh checkout
needs no setup. A deployment overrides them through its environment.

Durations are whole numbers of **milliseconds** (`REQUEST_TIMEOUT=30000` is thirty seconds). A value
with a unit, such as `30 seconds`, is refused at startup with a message naming the variable.

## Example file

`.env.example` lists every variable with its default and a one-line description. It is generated from
the configuration itself, so it is always complete:

```bash
pnpm app config:generate               # create .env.example (never replaces an existing, different file)
pnpm app config:generate --overwrite   # replace it after a confirmation (--force skips the prompt)
pnpm app config:generate --check       # fail if the file is out of date
cp .env.example .env                # then change only what you need
```

The command never writes a real `.env` file.

## Server

| Variable               | Default      | Description                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------------- |
| `HOST`                 | `0.0.0.0`    | Bind address                                                                |
| `PORT`                 | `3000`       | Bind port                                                                   |
| `BODY_LIMIT`           | `1048576`    | Largest accepted request body in bytes; bigger bodies get `413`             |
| `REQUEST_TIMEOUT`      | `30000`      | Milliseconds a request may run before it is cancelled and answered with `504` |
| `SHUTDOWN_TIMEOUT`     | `10000`      | Milliseconds a stop signal waits for requests still being handled           |
| `SHUTDOWN_DRAIN_DELAY` | `0`          | Milliseconds between `/health` turning `503` and the server closing         |
| `MAX_IN_FLIGHT`        | `1024`       | Requests handled at once before new ones are refused with `503`; `0` turns the guard off |
| `TRUST_PROXY`          | `false`      | Read the client address from proxy headers (only behind a proxy you control) |

## Database

| Variable                | Default                  | Description                                                              |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_DRIVER`       | `sqlite`                 | `sqlite` (Node.js) or `d1` (Cloudflare D1)                               |
| `DATABASE_PATH`         | `./storage/data/edgy.db` | SQLite file, or `:memory:`; parent directories are created (`sqlite` only) |
| `D1_BINDING`            | `DB`                     | Name of the D1 binding in `wrangler.jsonc` (`d1` only)                   |
| `DATABASE_AUTO_MIGRATE` | `false`                  | Apply pending migrations when the Worker starts (`d1`, Workers)          |

## Logging

| Variable             | Default      | Description                                                                |
| -------------------- | ------------ | -------------------------------------------------------------------------- |
| `LOG_LEVEL`          | `Info`       | `All` \| `Fatal` \| `Error` \| `Warn` \| `Info` \| `Debug` \| `Trace` \| `None` (**case-sensitive**). `Debug` and `Trace` also add `error.debug` (the redacted cause) to server-error responses; `Trace` also prints every SQL statement with its duration (never the values) |
| `LOG_TRANSPORT`      | `console`    | Where logs go: any of `console`, `file`, `otlp`, comma-separated (`otlp` needs `OTEL_EXPORTER_OTLP_ENDPOINT`) |
| `LOG_FILE`           | `./storage/logs/edgy.jsonl` | Base path of the log file; the file written carries the period (see below) |
| `LOG_ROTATION`       | `daily`      | How often a new log file starts: `hourly`, `daily`, `weekly` or `monthly` (UTC) |
| `LOG_FILE_MAX_FILES` | `14`         | Log files kept, the current one included; older ones are deleted. `0` keeps every file |
| `LOG_FORMAT`         | `pretty`     | Console format: `pretty` for readable lines, `json` for one JSON object per line |
| `LOG_FLUSH_INTERVAL` | `250`        | Milliseconds log lines are buffered before they are written together (Node.js) |

Requests that are only noise are written at `Debug`, so they do not appear at `Info`: a browser asking for
`favicon.ico`, a crawler for `robots.txt`, Chrome DevTools, a load balancer polling `/health` or `/metrics`
and a vulnerability scanner probing for `wp-login.php` or `.env` (404s only). Set `LOG_LEVEL=Debug` to see
them again. A health check that fails is always logged. They are still counted in the metrics, except that
health and metrics polls are left out of the latency histogram and are not traced.

The file always holds one JSON object per line, whatever `LOG_FORMAT` says, with the keys in a fixed
order that starts with the time (`timestamp`, `level`, `message`, `annotations`, then `cause` when there is
one). `LOG_FORMAT=json` on the console uses the same shape. The file's name is the base name
from `LOG_FILE` plus the period it covers, with underscores as separators:

| `LOG_ROTATION` | File name                      | Starts a new file     |
| -------------- | ------------------------------ | --------------------- |
| `hourly`       | `edgy_20261015_09.jsonl`       | every hour            |
| `daily`        | `edgy_20261015.jsonl`          | every day             |
| `weekly`       | `edgy_20261012.jsonl`          | every Monday (its date) |
| `monthly`      | `edgy_202610.jsonl`            | every month           |

Periods are in UTC, the same clock as the `timestamp` inside each line. A restart within the same period
appends to the same file. Each line goes to the file of its own timestamp, so lines around midnight land
in the right file. Once there are more than `LOG_FILE_MAX_FILES` files, the oldest are deleted; only files
named like the pattern above are ever touched, never other files in the directory. Rotated files are not
compressed.

A `LOG_FILE` that cannot be opened stops the process at startup. A write that fails later is reported on
standard error and that batch of lines is dropped. On Cloudflare Workers `LOG_TRANSPORT` has no effect;
logs go to the platform's stream.

## Security

| Variable            | Default    | Description                                                              |
| ------------------- | ---------- | ------------------------------------------------------------------------ |
| `RATE_LIMIT_ENABLED` | `true`    | Turns rate limiting on `/api` on or off                                  |
| `RATE_LIMIT_MAX`    | `100`      | Requests per client per window; at least `1`. With `cloudflare` it is only reported, so keep it equal to the limit in `wrangler.jsonc` |
| `RATE_LIMIT_WINDOW` | `60000`    | Length of the rate-limit window, in milliseconds                         |
| `RATE_LIMIT_STORE`  | `memory`   | Where counters live: `memory` (per process), `redis` (shared by every instance, Node.js only) or `cloudflare` (Workers only) |
| `RATE_LIMIT_BINDING` | `RATE_LIMITER` | Name of the Workers rate-limit binding, used when `RATE_LIMIT_STORE=cloudflare` |
| `REDIS_URL`         | `redis://:securedb@localhost:6379` | Redis or Valkey URL, used when `RATE_LIMIT_STORE` or `CACHE_STORE` is `redis` (one connection serves both). Secret; the default is the Valkey of `pnpm compose:up` |

With `memory` each running instance keeps its own counts, so the effective limit is `RATE_LIMIT_MAX`
times the number of instances. With `redis` every instance counts against one allowance, which makes
`RATE_LIMIT_MAX` the real global limit. If Redis is slow or down the limiter lets requests through
instead of refusing them (it gives up on a call after a fraction of a second and skips Redis for ten
seconds), because a rate limiter must not take the API down with it.

With `cloudflare` the count is kept by Cloudflare's rate-limit binding, per location and eventually
consistent: it holds back abuse but is not an exact global quota. The allowance and the period (10 or
60 seconds) are declared under `ratelimits` in `wrangler.jsonc`, so `RATE_LIMIT_MAX` is only reported as the limit (keep it equal to the one in `wrangler.jsonc`);
`RATE_LIMIT_WINDOW` only sets the `Retry-After` a refused client is told, so keep it equal to the
period. The binding does not report what is left, so those responses omit the remaining count.
A store that is not available on the running platform (`redis` on Workers, `cloudflare` on Node.js)
stops startup with a message instead of failing quietly. Set `TRUST_PROXY=true` behind a
proxy, otherwise every client appears to have the proxy's address.

`MAX_IN_FLIGHT` is the overload guard: past that many requests at once the server answers `503` with
`Retry-After: 1` immediately, instead of queueing everyone until they time out. `/health` and
`/metrics` are never refused.

## Cache

User lookups by id are cached. The cache is on by default and lives in the process, which is what
the server always did; a shared store is opt-in.

| Variable           | Default  | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `CACHE_ENABLED`    | `true`   | Turns the cache on or off; off sends every read to the database             |
| `CACHE_STORE`      | `memory` | `memory` (per process), `redis` (shared by every instance, Node.js only) or `cloudflare` (Workers only) |
| `CACHE_TTL`        | `30000`  | How long an entry stays cached, in milliseconds                             |
| `CACHE_LOCAL_TTL`  | `5000`   | With a shared store, how long a process also keeps its own copy (`0` keeps none), in milliseconds |
| `CACHE_MAX_ENTRIES`| `256`    | Entries a process keeps in memory, per cache                                |

A write removes the entry it changes, so the only stale reads are those that follow a write made by
another instance. With `memory` that lasts up to `CACHE_TTL`; with a shared store the entry is gone for
everyone at once, apart from the local copies, which last up to `CACHE_LOCAL_TTL`. Lower it (or set `0`)
if that matters more to you than saving a round trip to the store.

Add `?nocache=true` to a `GET` to read straight from the database for that request. It neither reads nor
changes the cache, so it shows what is really stored without refreshing what other callers are served.
Anyone who can call the API can use it, so it is not a way to protect the database; rate limiting is.

Which store helps depends on the database. A row read from SQLite on the same machine takes tens of
microseconds, quicker than any round trip to Redis, so for a single Node.js server `memory` is the right
choice. `redis` pays off with several instances or a networked database. With `redis` an unreachable store
costs the cached entries, not the requests: calls to it are given up on after a fraction of a second and
skipped for ten seconds, the same as the rate limiter.

`cloudflare` uses Cloudflare's Cache API. Entries are kept per location and expire after `CACHE_TTL`
(rounded up to whole seconds); removing one removes it only in the location that handled the write, so
another location can serve it until it expires. The Cache API stores nothing on `*.workers.dev`, so there
every read reaches D1; use a custom domain.

## Observability

| Variable                         | Default     | Description                                                              |
| -------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `METRICS_ENABLED`                | `false`     | Serve Prometheus metrics at `GET /metrics`                               |
| `OTEL_SDK_DISABLED`              | `false`     | `true` turns trace, metric and `otlp` log export off, whatever the endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | `http://localhost:4318` | OTLP/HTTP collector base URL; the default is the ClickStack of `pnpm compose:up` |
| `OTEL_EXPORTER_OTLP_HEADERS`     | `authorization=edgy-dev-ingestion-key` | Headers sent with every export, `key=value` pairs separated by commas. Secret; the default is the development key of `pnpm compose:up` |
| `OTEL_SERVICE_NAME`              | `edgy`      | Service name attached to every signal                                    |
| `OTEL_EXPORT_INTERVAL`           | `5000`      | Milliseconds between exports of buffered traces, metrics and logs        |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | `gzip`      | Compression of export requests: `gzip` or `none`                         |
| `OTEL_TRACES_SAMPLE_RATIO`       | `1`         | Fraction of requests whose trace is recorded, from 0 to 1                |

Telemetry is OpenTelemetry over HTTP with JSON bodies (no gRPC), so it works with ClickStack/HyperDX,
Grafana, Honeycomb or any OpenTelemetry collector. It is on by default and aimed at the local
collector: where none is listening the exporters fail quietly and pause, so nothing breaks, but a
deployment without a collector should set `OTEL_SDK_DISABLED=true` instead of exporting to localhost.
Traces and metrics follow the endpoint; logs are sent when `LOG_TRANSPORT` includes `otlp`.

The development key and password above belong to the local Docker stack. Production sets its own
`OTEL_EXPORTER_OTLP_HEADERS` and `REDIS_URL` through the environment.

- **Traces** have a server span per request named after the route (`GET /api/users/:id`), with the
  database calls beneath it. A `traceparent` header from the caller continues its trace, and the id
  comes back as `metadata.trace_id`, so a report from a client can be found. A `404` or a validation
  error is not an error span; a `5xx` is.
- **Sampling.** `OTEL_TRACES_SAMPLE_RATIO=0.1` records one request in ten. A caller's sampled trace is
  always kept.
- **Delivery never slows a request.** Everything is buffered and sent in the background. If the
  collector fails, export pauses for a minute and drops what it held rather than building up memory.

> [!WARNING]
> `/metrics` has no authentication. Enable it only where the port is not reachable from the internet.

## CORS

| Variable             | Default | Description                                              |
| -------------------- | ------- | -------------------------------------------------------- |
| `CORS_ORIGINS`       | `*`     | `*` or a comma-separated allowlist                       |
| `CORS_METHODS`       | `*`     | `*` or a comma-separated list                            |
| `CORS_ALLOW_HEADERS` | `*`     | `*` or a comma-separated list                            |
| `CORS_CREDENTIALS`   | `false` | Send `access-control-allow-credentials`                  |
| `CORS_MAX_AGE`       | `86400` | Preflight cache seconds; `false` or `0` omits the header |

> [!WARNING]
> `CORS_CREDENTIALS=true` requires an explicit `CORS_ORIGINS` allowlist. A wildcard origin is
> invalid for credentialed requests, so the process fails fast at startup instead of sending a
> header browsers will reject.

## Cloudflare Workers

On Workers the same variables go under `vars` in `wrangler.jsonc` (secrets through
`wrangler secret put`). A Worker always uses D1, so `DATABASE_DRIVER` and `DATABASE_PATH` have no
effect there; the binding is the one named by `D1_BINDING`. `LOG_TRANSPORT` can be `console`, `otlp` or
both (`file` has no meaning there), and `RATE_LIMIT_STORE=redis` and `CACHE_STORE=redis` are not available on Workers (use `memory` or `cloudflare`).
Telemetry is flushed after a response, at most once per `OTEL_EXPORT_INTERVAL`, so the last
requests before an idle period are sent when the next one arrives.

## Example

```bash
CORS_ORIGINS="https://app.example.com,https://admin.example.com" \
CORS_CREDENTIALS=true \
LOG_LEVEL=Warn \
PORT=8080 \
pnpm app serve
```
