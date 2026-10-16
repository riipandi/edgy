# Architecture

How the system is built, per area, and why. What must not break is in `rules.md`; where a path or command lives is in `shape.md`. This file does not record how things got here.

## Shape of the system

One application, two runtimes. Node.js (`node:sqlite`) and Cloudflare Workers (D1) share `createApp`, the modules and the configuration. They differ in three places: the composition root (`main.ts` + `layers.ts` on Node, `worker.ts` on Workers), the logger sink, and the database layer. The seam is `DatabaseService`: both drivers are built by `makeDatabaseService`, so repositories do not know which one they run on.

```
 request ─► h3 app (createApp) ─► middleware chain ─► route group ─► handler
                                                                    │
                          runEffect (span, timeout, reporting, envelope)
                                                                    │
                              service ─► repository ─► DatabaseService ─► sqlite | D1
```

- **Layers, not singletons.** Services are `Context.Service` classes with a `static layer`. `ServicesLayer` (portable) wires every module over a `DatabaseService`; Node adds the configured database and rate-limit store (`layers.ts`), the Worker adds D1. `CoreLayer` (config, logger, telemetry, error reporter, platform services) is provided once, in `main.ts`; commands add their own layers.
- **Vertical modules.** `src/modules/<resource>/` holds schema, repository, service, handler, routes and tests. `routes/api.ts` (`apiModules`) and `services.ts` are the only files that list modules. `src/kernel/` knows h3 and Effect but no resource.
- **Limits of the Worker target.** D1 has no interactive transactions and its introspector cannot read columns; rate-limit counters are per isolate (per Cloudflare location with the binding); the import graph must stay free of Node-only modules, which only a run in workerd checks.

## Frontend

Pages are Marko 6 templates rendered on the server and streamed, hydrated only where a component has state; styles are vanilla-extract (`.css.ts`, evaluated at build time into class names and one stylesheet). Marko compiles each page's browser entries from the server build, so a page ships the script of its interactive tags and nothing else. Pages are routes of the same h3 app and run the same Effect programs as the API (`definePageHandler` over `runProgram`), so services, cache, tracing, timeout, error reporting and the rate limiter are shared; only the response differs (HTML with a per-response CSP nonce). An error follows the path: JSON under `/api`, an error page elsewhere.

Why this stack: the project needed React-level interactivity from a server-rendered page without moving the server into a frontend framework. Marko is a template compiler, not a router or a server, so h3 keeps routing, the request chain and the runtime split. LiquidJS cannot hydrate, and Octane was too young (beta, no verified Workers path). Vite is the build tool because Marko and vanilla-extract integrate through it, and its Cloudflare plugin runs the Worker in workerd during development and writes the deployable configuration. `@marko/run` owns routing and has no maintained Cloudflare adapter. Costs: the Marko and vanilla-extract plugins for Vite 8 are young, `.marko` has its own type checker (`mtc`), and a style or template edit in dev is a full reload, since the pages are server-rendered.

## HTTP layer

- **Plugins are the composition primitive.** Global middleware, route groups and per-route behaviour are all `H3Plugin`s composed in `createApp`. `defineRouteGroup` gives each group an isolated router at a prefix; `mount` merges its routes into the parent rou3 trie, so there is one lookup and no nested fetch.
- **`runEffect` bridges h3 to Effect.** The service context is captured once into an `HttpRuntime` and attached to each request. `runEffect` runs the program with the request's `AbortSignal` (a disconnect interrupts the fiber), bounds it with `REQUEST_TIMEOUT`, wraps it in error reporting and a server span, and renders the outcome.
- **Handlers declare contracts.** `defineHandler`, `definePagedHandler` and `defineMessageHandler` read the JSON body, decode params, body and query with Effect Schema inside the program, and encode the value through the response schema (a leak guard: an undeclared column never leaves the process). The same declarations feed `openapi:generate`, so the API description cannot drift from the code.
- **One response format.** Every `/api` response is `{ status, data | error, metadata, links? }` (`api-response.md`). Errors from h3 itself (unknown path, wrong method, malformed JSON, 413) pass through `renderHTTPError` into the same envelope.
- **Errors render themselves.** `AppError` is an interface; each error class implements it, so the responder only renders and a module adds errors without touching the kernel. `debug` exists only at log level `Debug` or below, and one redaction (`kernel/redact.ts`) guards the envelope, the error reporter and the query logger.
- **Overload and shutdown.** `provideRuntime` counts requests in flight (until the response body ends). `loadShedding` refuses new ones with `503` past `MAX_IN_FLIGHT`. On a stop signal `/health` turns `503`, the server drains in-flight requests (bounded by `SHUTDOWN_TIMEOUT`), force-closes, releases the database, and flushes the log buffer last.
- **Ids.** Every identifier is a TypeID declared with `defineId` beside what it identifies (`req_`, `trc_`, `inst_`, `user_`). The request id is bound to the request's async chain so code outside any fiber (Kysely's log callback) can read it. The trace id is the OpenTelemetry id's 128 bits re-encoded, so nothing relates the two but the encoding.

## Data

- **Kysely on one contract.** `DatabaseService` exposes `db`, `query`, `read`, `ping`. `node:sqlite` runs under our own dialect (one synchronous connection, prepared-statement cache, WAL; Kysely's connection mutex is the queue, and `query` leaves it when the request is cancelled); D1 under a dialect adapted from `kysely-d1` with its own introspector. The same Kysely migrator runs on both, so there is one migration history; on SQLite it runs in one transaction behind a write lock, so a failing migration leaves nothing and two processes cannot both apply one.
- **Reads and writes are different calls.** `read` repeats a transient failure twice with jittered backoff on D1 and is plain `query` elsewhere; writes have no retrying entry point. There is no `transaction`: nothing needs one yet, and an unbounded one could hold the single SQLite connection with no way to cancel it.
- **Schemas are the single source.** One entity `Struct` per resource derives the request, response and Kysely table types. Rows are not decoded on read.
- **Keyset pagination, no totals.** A list is read after an anchor `(sort value, id)`, one row over the limit says whether more follows, and the answer carries an opaque cursor instead of a page number and count. A page costs the same wherever it is, the order is total, and a row inserted mid-walk cannot shift or repeat a page. The price: no random access to page N and no total.
- **Cache.** `UserService.get` reads through `makeReadThrough`, Effect's `PersistedCache` shaped by `CACHE_*`: off, in the process (default), or in a shared store (Redis on Node, the Cache API on Workers) with a short local copy. Failures are never kept, a failing store degrades to the database, writes invalidate the keys they touch, `?nocache=true` skips it for one request, and `list` bypasses it.
- **Migrations and seeders** are static registries (inlined by the bundler, no directory scan). The CLI wraps Kysely's migrator.
- **Remote D1.** `--remote` on `migrate:up|down|status` reaches the real database through a temporary Wrangler config marked `remote: true`; `reset` and `seed` never do, so production data is not wiped or filled from the CLI.

## Configuration

All environment parsing is in `src/kernel/config/`. Each variable is declared once with a field helper that builds the parser and its documentation together; sections (`server`, `database`, `logging`, `security`, `observability`, `cors`) group fields and `AppConfig` is inferred. `config:generate` derives `.env.example` from the same declarations. An invalid value fails with a typed `ConfigError` while the layer builds, so a bad value stops the process at startup, not mid-request. Durations are whole milliseconds. The defaults of the telemetry endpoint, its headers and `REDIS_URL` are the Compose stack's, so a fresh checkout works with no setup. Consumers depend on the `ConfigService` tag.

## Observability

- **Logging.** Lines are formatted on the calling fiber and buffered; a detached fiber writes the buffer once per `LOG_FLUSH_INTERVAL`, so no request waits on a terminal. `LOG_TRANSPORT` selects any of `console`, `file`, `otlp`, each receiving every line. The file sink rotates by hour, day, week or month in UTC, keeps `LOG_FILE_MAX_FILES` files, and always writes JSON. Workers log straight to the console.
- **Telemetry.** OTLP over HTTP/JSON, built from Effect's exporters: traces and metrics through one `TelemetryRuntimeLayer` that every composition root builds once, logs as one more sink behind the same `Flusher`. Export is buffered and never on the request path; an exporter whose collector fails pauses for 60 s and drops its buffer. Node flushes at shutdown; a Worker flushes through `waitUntil`, at most once per interval.
- **Tracing.** One server span per request, named after the matched route, continuing the caller's `traceparent`; new traces are sampled by `OTEL_TRACES_SAMPLE_RATIO` (default 0.7). A client error ends the span `Ok` with its status; only 5xx and defects fail it. The trace id is returned as `metadata.trace_id`, and request log lines join their trace.
- **Metrics.** One observer plugin counts and times every response (404s and h3-level errors included); probes are counted but not timed; refused requests have their own counter.
- **Request log noise.** Browser file requests, crawler files, successful probes and scanner 404s are logged at `Debug` from a hard-coded list, so `Info` shows the requests that matter; a quiet request that fails is logged normally.
- **Failure reporting.** Errors below 500 are ignorable; everything else reaches the error reporters once. The default reporter logs through the failing fiber's logger, so it reaches every sink.

## Security and resilience

- **Baseline.** Fixed security headers on every response, JSON-only bodies (`415`), body limit (`413`), CORS (credentials with a wildcard origin refused at startup), no authentication (no policy exists to enforce).
- **Rate limiting** covers `/api` and the HTML pages, switched by `RATE_LIMIT_ENABLED` and backed by `RATE_LIMIT_STORE`: `memory` counts in the process; `redis` counts through Effect's `RateLimiter` so the limit is global (Node only); `cloudflare` asks Workers' Rate Limiting binding (per location, eventually consistent, Workers only).
- **One fail-open rule.** Every guard around an optional store (cache backings, the shared rate limiter, the Workers binding) uses one state machine (`src/kernel/fail_open.ts`): 250 ms budget, skip the store for a cooldown after a failure, let exactly one call probe it when the cooldown ends, announce the outage once. A store outage never becomes an API outage or a per-request delay.
- **The client address** used by the limiter and logs is the platform header (`TRUSTED_PLATFORM`) when it may be believed, else the socket's address, else `X-Forwarded-For` read from the right through trusted proxies. A client writes the left of that list, so the left is never believed. `PROXY_PROTOCOL` restores the address behind a TCP-level balancer.
- **Bounded waiting everywhere.** Reading a body is bounded by `REQUEST_TIMEOUT` (`408`, and the connection is released); every telemetry export has a 5 s deadline and shutdown's last flush 1 s; a log sink write has 5 s. A stuck collector, pipe or disk costs a gap in data, never latency or memory.
- **Unsupported on purpose.** A Node build refuses a dependency that ships a native addon (the bundle inlines every package); wrong-method requests answer `405` with `Allow`, read from h3's own router.

## Build and deploy

Vite 8 (Rolldown) builds, serves and previews both platforms. `vite.config.ts` stays the user's: plain Vite configuration plus `plugins: [edgy({ mode })]`; the plugin only fills in what that configuration leaves unset. `edgy` (`builder/edgy.ts`) is one Vite plugin made of small ones: what both platforms share (output shape, Marko, vanilla-extract) and the platform's own, chosen by `--mode` (`worker`, else node). The command line is Vite's (`vite`, `vite build`, `vite preview`); `--mode` is the switch because Vite refuses unknown options before reading the configuration and `--target` is already its language level.

- **Node** (`builder/node.ts`): one SSR bundle with every dependency inlined and the browser assets in `assets/` beside it; `vite` runs the application inside the dev server through Vite's module runner and the same `makeNodeApp` as production, so Vite owns the process, port, watcher and hot-reload socket and a server-code change swaps the application in place; `vite build` emits `package.json` and sets the executable bit; `vite preview` runs the built server behind the preview address.
- **Worker** (`builder/worker.ts`): `@cloudflare/vite-plugin`, which reads `wrangler.jsonc`, loaded only when asked for, with Marko's build order written out. Its browser assets go in `dist/worker/public`, a directory of their own, because Cloudflare serves everything in the directory it is given and it must not hold `index.js`.
- **Single executable** (`builder/compile.ts`): the application built once as one CJS file, assets embedded, then postject.
- Production runs on plain Node (`serveHttp`: its own listener, drain, PROXY protocol).

## Development services

`compose.yaml` runs what the app talks to, not the app: ClickStack (HyperDX, ClickHouse and the collector in one container), a one-shot that registers the development account, and Valkey. A fixed ingestion key lets the collector accept the app's default header, so telemetry works on the first `pnpm compose:up`. The all-in-one image is for development; production runs the pieces separately.

## Testing

Unit and integration tests run on Vitest with `@effect/vitest`: they build the real application over an in-memory database (`makeTestApp`) and call `app.fetch`, covering middleware order, envelope, pagination, migrations and tracing without a port. D1 is tested against a fake binding backed by `node:sqlite`; the OTLP collector is an in-process `fetch`; Effect tests run on TestClock. Interactive tags are tested in jsdom with `@marko/testing-library` (project `marko`): Marko compiles the template for the browser, so state and updates run for real, without the server or a CSP. End-to-end tests run on Playwright Test against the production build, in real browsers. Details and traps: `rules.md`.
