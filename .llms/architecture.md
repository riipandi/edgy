# Architecture

How the system is built today, per area. What must not break is in `rules.md`; where a path or command lives is in `shape.md`. This file describes; it does not record how things got here.

## Shape of the system

One application, two runtimes. Node.js (`node:sqlite`) and Cloudflare Workers (D1) share `createApp`, the modules and the configuration. They differ in three places: the composition root (`main.ts` + `layers.ts` on Node, `worker.ts` on Workers), the logger sink, and the database layer. The seam is `DatabaseService`: both drivers are built by `makeDatabaseService`, so repositories do not know which one they run on.

```
 request ─► h3 app (createApp) ─► middleware chain ─► route group ─► handler
                                                                    │
                          runEffect (span, timeout, reporting, envelope)
                                                                    │
                              service ─► repository ─► DatabaseService ─► sqlite | D1
```

- **Layers, not singletons.** Services are `Context.Service` classes with a `static layer`. `ServicesLayer` (portable) wires every module's repositories and services over a `DatabaseService`; Node adds the configured database and the rate-limit store (`layers.ts`), the Worker adds D1 (`worker.ts`). `CoreLayer` (config, logger, telemetry, error reporter, platform services) is provided once, in `main.ts`; commands add their own layers.
- **Vertical modules.** `src/modules/<resource>/` holds schema, repository, service, handler, routes and tests. `routes/route.ts` and `services.ts` are the only files that list modules. The kernel (`src/kernel/`) knows h3 and Effect but no resource.
- **Limits of the Worker target.** D1 has no interactive transactions, its introspector cannot read columns, rate-limit counters are per isolate (or per Cloudflare location with the binding), and the Worker's import graph must stay free of Node-only modules (checked by running `pnpm preview`, not by the compiler).

## HTTP layer

- **Plugins are the composition primitive.** Global middleware, route groups and per-route behaviour are all `H3Plugin`s composed in `createApp`. `defineRouteGroup` gives each group an isolated router mounted at a prefix; `mount` merges its routes into the parent rou3 trie, so there is one lookup and no nested fetch. App-level config and hooks do not reach mounted groups, so shared behaviour is global middleware.
- **`runEffect` bridges h3 to Effect.** The service context is captured once into an `HttpRuntime` and attached to each request by the `provideRuntime` plugin. `runEffect` runs the program on it with the request's `AbortSignal` (a disconnect interrupts the fiber), bounds it with `REQUEST_TIMEOUT`, wraps it in error reporting and a server span, and renders the outcome as the envelope.
- **Handlers declare contracts.** `defineHandler`, `definePagedHandler` and `defineMessageHandler` read the body (JSON only), decode params, body and query with Effect Schema inside the program, run `run`, encode the value through the response schema (a leak guard: an undeclared column never leaves the process) and return it as `data`.
- **One response format.** Every `/api` response is `{ status, data | error, metadata, links? }` (`api-response.md`). Collections carry pagination metadata and relative links; `sort_by` is checked against a per-resource allow-list. h3-level errors (unknown path, malformed JSON, 413) go through `renderHTTPError` into the same error envelope.
- **Errors render themselves.** `AppError` is an interface (`status`, `code`, `clientMessage`, `detail`, `retryable`, `cause`); each error class implements it, so the responder only renders. The envelope's `error` is `{ code, retryable, details?, debug? }`; `debug` carries the redacted cause and exists only when the log level is `Debug` or below, and the same redaction guards the error reporter and the query logger (`src/kernel/redact.ts`). `HttpEnv`, the services a handler may require, is the union of `HttpServices`, which each service extends by declaration merging next to its own definition.
- **Overload and shutdown.** `provideRuntime` counts requests in flight. `loadShedding` refuses new ones with `503` past `MAX_IN_FLIGHT`. On a stop signal `/health` turns `503`, the server drains in-flight requests (bounded by `SHUTDOWN_TIMEOUT`, counting requests, not connections), then force-closes, then the database is released and the log buffer flushed last.
- **Ids.** Every identifier is a TypeID, declared where it belongs with `defineId` (`src/kernel/objectids.ts`): `req_` in the request-id plugin, `trc_` in `observer/trace_id.ts`, `inst_` in `observer/telemetry.ts`, `user_` in the user schema. The request id is written to `res.headers` and `res.errHeaders`, and bound to the request's async chain so code outside any fiber (Kysely's log callback) can read it. The trace id is the OpenTelemetry id's 128 bits re-encoded (`traceTypeId`/`traceHexOf`), so nothing relates the two but the encoding.

## Data

- **Kysely on one contract.** `DatabaseService` exposes `db`, `query`, `read`, `transaction` and `ping`. `node:sqlite` is driven by our own dialect (single synchronous connection, mutex, prepared-statement cache, WAL); D1 by a dialect adapted from `kysely-d1` with its own introspector (Kysely's calls `pragma_table_info`, which D1 rejects). The same Kysely migrator runs on both, so there is one migration history.
- **Reads and writes are different calls.** `read` repeats a transient failure twice with jittered backoff on D1 and is plain `query` elsewhere; writes have no retrying entry point. `transaction` works on SQLite and fails on D1.
- **Schemas are the single source.** One entity `Struct` per resource derives the request, response and Kysely table types. Rows are not decoded on read.
- **Pagination in one statement.** The page and its total come from one query (the total as a scalar subquery); only an empty later page needs a count.
- **Cache.** `UserService.get` reads through an Effect `Cache` (256 entries, 30 s, failures not kept); writes invalidate the keys they touch; `list` bypasses it.
- **Migrations and seeders** are static registries (inlined by the bundler, no directory scan). The CLI wraps Kysely's migrator; `migrateDown(steps)` is built on `migrateTo`.

## Configuration

All environment parsing is in `src/kernel/config/`. Each variable is declared once with a field helper that builds the parser and its documentation together; sections group fields (`server`, `database`, `logging`, `security`, `observability`, `cors`) and `AppConfig` is inferred from them. `config:generate` derives `.env.example` from the same declarations. Invalid values fail with a typed `ConfigError` while the layer builds, so a bad value stops the process at startup, not mid-request. Durations are whole milliseconds. The defaults of the telemetry endpoint, its headers and `REDIS_URL` are the Docker Compose stack's, so a fresh checkout works with no setup; `OTEL_SDK_DISABLED` turns telemetry off. Consumers depend on the `ConfigService` tag.

## Observability

- **Logging.** Lines are formatted on the calling fiber and buffered; a detached fiber writes the buffer once per `LOG_FLUSH_INTERVAL`, so no request waits on a terminal. `LOG_TRANSPORT` selects any of `console`, `file`, `otlp`, each receiving every line. The file sink rotates by hour, day, week or month in UTC (`edgy_YYYYMMDD_hh.jsonl`-style names), keeps `LOG_FILE_MAX_FILES` files, and always writes JSON with a fixed key order starting at `timestamp`. The pretty console format prints each fact once. Workers log straight to the console.
- **Telemetry.** OTLP over HTTP/JSON (no gRPC), built from Effect's own exporters: traces and metrics through one `TelemetryRuntimeLayer` that every composition root builds once, logs as one more sink behind the same `Flusher`. Export is buffered and never on the request path; an exporter whose collector fails pauses for 60 s and drops its buffer. On Node each exporter flushes at shutdown; a Worker flushes through `waitUntil`, at most once per interval.
- **Tracing.** One server span per request, named after the matched route and continuing the caller's `traceparent`; `OTEL_TRACES_SAMPLE_RATIO` samples new traces. A client error ends the span `Ok` with its status; only 5xx and defects fail it. The trace id is returned as `metadata.trace_id` and request log lines join their trace.
- **Metrics.** One observer plugin counts every response (including 404s and h3-level errors) and times it, except probes (`/health`, `/metrics`), which are counted but not timed; refused requests have their own counter.
- **Request log noise.** Browser file requests, crawler files, successful probes and scanner 404s are logged at `Debug` from a hard-coded list (`quiet_paths.ts`), so the log at `Info` shows requests that matter; a quiet request that fails is logged normally. A probe's trace is not recorded. `GET /metrics` serves them as Prometheus text when `METRICS_ENABLED`.
- **Failure reporting.** Errors below 500 are marked ignorable; everything else reaches the error reporters once. The default reporter logs through the failing fiber's own logger, so it reaches every sink; more reporters are entries in `ErrorReporter.layer`.

## Security and resilience

- **Baseline.** Fixed security headers on every response, JSON-only bodies (`415`), body limit (`413`), CORS (credentials with a wildcard origin refused at startup), no authentication (no policy exists to enforce).
- **Rate limiting** on `/api`, switched by `RATE_LIMIT_ENABLED` (on by default) and backed by `RATE_LIMIT_STORE`. `memory` counts in the process; `redis` counts through Effect's `RateLimiter` over Redis/Valkey so the limit is global (Node only); `cloudflare` asks Workers' Rate Limiting binding, which is per location, eventually consistent and configured in `wrangler.jsonc` (Workers only). Every shared store has a 250 ms budget and a 10 s cooldown after a failure: it fails open, so a store outage never becomes an API outage or a per-request delay.
- **Overload.** `MAX_IN_FLIGHT` refuses early with `503` + `Retry-After`, exempting `/health` and `/metrics`.
- **Telemetry outages** cost a gap in data, never latency or memory.

## Build and deploy

`builder/` is a Rolldown pipeline independent of `src/`, with two runtimes. `node` bundles the server (ESM, per-package chunks, native packages external and traced, minimal `package.json`) and can compile a single executable (SEA + postject). `workers` applies a preset over that config (one file, `workerd` conditions, no shebang, no tracing) and is what `pnpm preview` and `pnpm deploy` run, built the same way, with `--no-bundle`; `watch:worker` lets wrangler bundle the source. Scripts are split by target.

## Development services

`compose.yaml` runs what the app talks to, not the app: ClickStack (HyperDX, ClickHouse and the collector as one container), a one-shot that registers the development account, and Valkey. A fixed ingestion key lets the collector accept the app's default header, so telemetry works on the first `pnpm compose:up`. The all-in-one image is for development; production runs the pieces separately.

## Testing

Vitest with `@effect/vitest`. Tests build the real application over an in-memory database (`makeTestApp`) and call `app.fetch`, so they cover middleware order, envelope, pagination, migrations and tracing without opening a port. D1 is tested against a fake binding backed by `node:sqlite` (result shape, message-only constraint errors, injectable transient failures); the OTLP collector is an in-process `fetch`. Effect tests run on TestClock. Details and traps: `rules.md`.
