# Architecture

## Runtime composition

The application is a modular monolith. `kernel/layers.ts`'s `CoreLayer` provides Node platform
services, configuration, logging, and telemetry. `ApplicationLayer` composes the feature modules'
own layers over the database layer — `identityLayer` (`modules/identity/module.ts`) merges the
identity module's self-wired service graph (`UserLayer`). The serve command provides that graph
around both startup migrations and the HTTP server, so migrations, user queries, and readiness
checks share one database service and scope.

`kernel/runtime.ts` is the one place that builds the `ManagedRuntime` from `ApplicationLayer` +
`CoreLayer` and owns its disposal (`applicationContext`, `disposeUserRuntime`/
`disposeUserRuntimeEffect`); the Vite API adapter and the serve command receive the context or the
dispose call from there, never the construction. Solid's production renderer carries the
already-built `UserService` through Node's async context while rendering; the development
renderer bridges through the kernel's runtime (`modules/identity/user/user_ssr.ts`'s
`AsyncLocalStorage` store falls back to `applicationRuntime.runPromise` when no request-scoped
service is set). The runtime is disposed when the Vite API handler closes, and by the serve
layer's finalizer in production.

`kernel/http/stack.ts` is the one middleware order (trust-proxy, tracer, cors, the caller's
routes, request-id, error-response, request-log, security-headers) that both the dev API handler
and the production server consume; each composition adds its own delta on top (dev:
`Layer.succeedContext`; serve: the SSR router and the dispose finalizer).

A feature module is self-contained: its service layer wires its own repository and cache
dependencies inside the module (`modules/identity/user/user_layer.ts`), so the composition root
never sees those dependencies — only the module's merged service layer. A module's package
`module.ts` re-exports its `HttpApiGroup`, its handlers factory, and its merged service layer
under its own name (identity exports `identityLayer`); the kernel imports a module through that
barrel alone, never a feature file directly. `kernel/registry.ts` is the one file that wires a
module into the application: it imports the module's group, handlers factory, and service layer,
and exports `api` (the `HttpApi.make(...).add(...)` chain), `moduleServiceLayer`
(`Layer.mergeAll` of every module's layer, consumed by `kernel/layers.ts`'s `ApplicationLayer`),
and `moduleHandlerLayer` (consumed by `kernel/http/api.ts`'s `apiRoutes`). Neither `kernel/layers.ts`
nor `kernel/http/api.ts` imports a feature module directly. The `.add(...)` chain stays a literal,
hand-written call rather than built from an array — Effect v4's `HttpApi.add` needs a tuple-typed
argument list, so a runtime array of module groups does not type-check without a cast.

## Feature and persistence boundaries

`modules/identity/user/user_service.ts` defines application operations and depends on the
`UserRepository` service contract in `modules/identity/user/user_repo.ts`, which implements that
contract using the `Database` service provided by the database adapter.
`modules/identity/user/user_layer.ts` wires the service over its own repository and cache layers
inside the module. The feature owns persistence behavior while the adapter owns the database
connection and lifecycle. Persistence failures cross the port as `UserRepositoryError`; HTTP
handlers translate those failures to a sanitized `503` response.

## API and HTTP

Effect HttpApi owns the wire contract: the group contracts (`kernel/healthcheck.ts`,
`modules/identity/user/user_route.ts`) define endpoint schemas, statuses, and error sets once —
every success/error schema wrapped in `SuccessEnvelope`/`ErrorEnvelope` except health's own — the
handler factories beside them implement them with `respondSuccess`/`respondError`, and
`kernel/registry.ts` composes `HttpApi.make(...).add(...).prefix('/api')` into the `api` value;
`kernel/http/api.ts` consumes that value into `HttpApiBuilder.layer` and re-exports it unchanged
for its own existing consumers. The rate-limit middleware is a router-level layer provided into
that composition. The OpenAPI document and the Scalar reference mount from the same contract
behind `API_DOCS_ENABLED`; the document title and version come from `package.json` through the
`OpenApi.Title`/`OpenApi.Version` annotations. `kernel/http/api.ts` exports the path constants
(`apiDocsPath`, `openApiPath`, `metricsPath`) that the Vite dev plugin's forwarding guard also
reads. The dev plugin forwards exactly the router-owned endpoints — `/api/*`, `apiDocsPath`,
`metricsPath` — and leaves page and asset paths to Vite; `apiHandler` mounts the Prometheus
endpoint behind the same `METRICS_ENABLED` gate the serve command uses, so dev answers what serve
answers.

`kernel/healthcheck.ts` serves the health check directly from `Database.ping` — the health
feature has no service of its own; the healthcheck CLI pings the same signal with a 2-second
timeout. `GET /api/health` is the only health endpoint: readiness semantics, fail-closed on a
database or rate-limit store outage. It keeps its own `{status, details}` shape rather than the
standard success/error envelope every other `/api/*` endpoint uses. Health's own `status`
(`ok`/`unhealthy`) is a different axis than the envelope's `status` (`success`/`error`), and the
endpoint is a stable machine contract shared with the healthcheck CLI and orchestration probes,
not a typical API client surface.

## Persistence

Kysely runs over SQLite through a dialect in `database/dialect.ts` built on Turso's SDKs, not
Node's `node:sqlite`. One URL resolves to one transport: `@tursodatabase/database` (a native
embedded engine) opens a `file:` URI or bare path locally, and `@tursodatabase/serverless` (pure
JavaScript over `fetch`) opens `libsql://`/`turso://`/`https://`/`http://` remotely.
`resolveDatabaseTarget` (`kernel/config/database.ts`) is the only place that decision is made, so
an unknown scheme is an error rather than a silent local file. `file:/path`, `file:///path`, and
`file://localhost/path` name this host; `file:./rel` is relative to the working directory and the
path is percent-decoded; a bare path is accepted as a convenience. `file://otherhost/path` and
`file://path` are refused by name — a local engine cannot open another machine's file, and the
second form has no path. `:memory:` is refused, because the healthcheck probe and a migration run
open the database from their own process and would each get a private one.

Both transports sit behind one Kysely dialect that keeps `kysely-libsql`'s shape
(`SqliteAdapter`/`SqliteIntrospector`/`SqliteQueryCompiler` plus a `TursoExecutor` —
`execute`/`begin`/`commit`/`rollback`/`close`), so feature code cannot tell which transport it is
talking to. The local executor awaits `prepare` and branches on `Statement.reader`; the remote one
drives `Session` from `@tursodatabase/serverless` directly, applying the 5-second
`REMOTE_QUERY_TIMEOUT_MS`. Remote rows arrive as arrays with non-enumerable named properties, so
the executor maps each row through `result.columns`. `SqliteAdapter.supportsMultipleConnections =
false` makes `Kysely.transaction` hold the one connection across the whole `BEGIN … COMMIT`, so a
concurrent statement waits for it — there is no custom lock. `streamQuery` clamps a non-positive
chunk size to one row, because Kysely forwards the caller's number verbatim and a driver pinning
the event loop would be the worse failure.

Every local connection opens through `LOCAL_CONNECT_OPTIONS`, which carries `experimental:
['multiprocess_wal']` — without it the engine holds an exclusive lock on the file for the
connection's lifetime, which would break the container healthcheck and any `migrate:up` run while
`serve` holds the database.

`database/schema.ts` exports an empty `Database` interface that feature schemas augment with their
table types; the identity module derives its Kysely row type from its Effect entity schema.
`DatabaseLayer` acquires the Kysely instance and destroys it when its Effect scope closes.
Migrations and seeders run through the same database service: `database/migrator.ts` wraps the
Kysely `Migrator` (a static in-bundle migration registry, `app_migration` tables) so every
migration method is an Effect requiring `Database` and failing with `DatabaseError` — Kysely's
resolve-with-`.error` convention is folded into the error channel at the boundary.

The Turso native binding is not inlined: the standalone build copies
`@tursodatabase/database-<platform>` into `dist/node_modules/` (dereferenced out of pnpm's store)
for the platform it was built on, and the container image copies `dist/` and nothing else — a
built `dist/` is portable only for the platform it targeted.

## CLI

`Command.run` decides two things by `GlobalFlag` object identity: whether a parsed `--log-level`
becomes the active minimum log level, and whether `--wizard` takes the wizard path — `cli.ts`
provides `CliConfig.layer({ builtIns: [Help, Version, LogLevel] })` (no cloning) so identity
survives the round trip. `normalizeArgs` lowercases the token after `--log-level` before the run,
matching the casing `LOG_LEVEL` already accepts. `src/main.ts` selects the runtime from the first
positional argv token (`subcommandOf`, skipping global flags and the value `--log-level`
consumes) — the server path skips `runMain` because Effect's interrupt-based exit detaches async
finalizers. `awaitShutdownSignal` keeps both signal listeners installed past the first signal and
exits `128 + signum` on any later one; both Redis stores build their stack into a scope they own,
closed from the finalizer between the two log lines, so no consumer-side finalizer can run after
the client's.

## Observability

Request metrics carry bounded labels: `http_requests{method, status_code, route}` and
`http_request_duration_seconds{method, route}`, where `route` is the matched route template from
the HttpApi contract (plus the `page`/`unmatched` literals). Dependency calls are traced through
one histogram, `dependency_duration_seconds{store, op}` (`store ∈ {sqlite, redis}`, a fixed `op`
set), plus bounded span attributes (`cache.status`, `limiter.verdict`) — never a query string,
cache key, or table name.

The observability stack (OpenTelemetry into ClickStack) runs as its own compose service set
(`clickstack`, `clickstack-init`, `cadvisor`, `redis-exporter`) alongside `app` and `redis`; a
provisioner reconciles ClickHouse connections, sources, dashboards, and table retention
(`CLICKSTACK_RETENTION_DAYS`, default 30) on every `compose up`, and an optional alert webhook
(`CLICKSTACK_ALERT_WEBHOOK_URL`) gates alert-channel creation.

## Operational limits

Each feature declares its lookup cache as a `Cacheable.Class` service tag (schemas for
serialization, the repository lookup, and a layer that resolves the cache configuration). The
cache defaults to process memory; `REDIS_ENABLE=true` shares entries through Redis
(`PersistedCache` over the compose Redis) and degrades to direct lookups when the backend is
unreachable. A failed lookup is never pinned: the entry is invalidated so the next request
retries. `CacheableService.get` pairs the value with a `CacheStatus` (`hit` | `miss` | `bypass` |
`disabled`) — hit detection peeks the in-memory layer without populating; `bypass` skips read and
fill. HTTP surfaces expose the status in the `x-cache` response header (the users API via a
`WithHeaders` success schema, the SSR user page via `httpHeader` before the shell flush), and
`?nocache=1` on either surface requests the bypass. Rate-limit windows live in the configured
store: fixed-window counters in the database, or shared counters in Redis
(`REDIS_ENABLE=true`). SQLite is the only engine: the local file and the remote Turso database are
two transports of the same dialect, and no PostgreSQL adapter exists.
