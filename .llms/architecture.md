# Architecture

Per-area reasoning and decision records. Read the section before changing that area.

## HTTP layer

**Decision: h3 plugins as the only composition primitive** (2026-10). Global middleware, route groups, and per-route behaviour are all `H3Plugin`s, composed in one place (`src/app.ts` → `createApp`). `defineGroup` (`src/routes/group.ts`) gives each group an isolated router mounted at a prefix; `mount` merges routes into the parent rou3 trie, so there is one lookup and no nested fetch hop. Consequence: app-level config/hooks do not inherit into mounted groups — that is accepted, shared behaviour goes in global middleware. Rejected: flat route tables (prefix boilerplate, group-wide middleware impossible) and nested `H3.fetch` delegation (extra hop, no trie merge).

**Decision: `runEffect` bridge on a captured service context, error mapping by tag** (2026-10-15, replaces the `AppRuntime` singleton). Handlers stay thin and delegate to `runEffect(event, effect)` (`src/kernel/http/responder.ts`), which runs the program with `Effect.runPromiseExitWith(services)`, opens a span per request, annotates logs with the request id, and maps `AppError` tags to statuses with an exhaustive switch. The service context is captured once in `serveHttp` (`makeHttpRuntime`) and handed to h3 through a plugin. Consequence: one set of layers per process, no manual `dispose`, and `createApp` can be built against any `HttpRuntime` in a test. Rejected: a module-level `ManagedRuntime` (second database connection and logger, global state, import-order coupling) and per-handler try/catch mapping (drift).

**Decision: validation inside the Effect program** (2026-10-15). `decode(schema)(input)` (`src/kernel/http/decode.ts`) fails with `ValidationError`, so the 400 body and the issue list come from one place. Before, h3's `readValidatedBody` threw its own error and `ValidationError` was never constructed.

**Decision: Effect Schema as the single contract, derived per resource** (2026-10-15). `src/schemas/user_schema.ts` declares the entity once and derives request, response and Kysely table types from it, so a column is declared in one place. Responses are encoded through the schema in `runEffect`: this is a leak guard (an undeclared column never leaves the process) and keeps the encoded wire type honest. Consequence: one small CPU cost per response, acceptable for flat structs. Rejected: hand-written interfaces per layer (drift), a monolithic validator module (grows with every endpoint), and decoding every database row (cost without a transformation to justify it). `kernel/http/` holds only code that does not grow with the endpoint count; contracts belong to the domain, so they stay in `schemas/`.

**Decision: request lifecycle is owned by `runEffect`** (2026-10-15). It forwards the request `AbortSignal` (a disconnected client interrupts the fiber), bounds the program with `REQUEST_TIMEOUT`, and answers an interrupt with 499 without logging an error. Verified in-process with an aborted `Request`; whether srvx fires the signal on a real socket close has not been exercised (port binding is blocked in the sandbox). Rejected: leaving abandoned requests to run to completion (wasted database time under load).

**Decision: one error shape for everything** (2026-10-15). `renderH3Error` renders h3-originated errors as `{ error }`, so clients parse one format. Cost: the hook must copy `errHeaders` by hand, and not-found needs a throwing catch-all because of how h3's `onResponse` middleware materialises the not-found marker (details in `rules.md`). Rejected: leaving h3's `{status, message}` body (two formats) and a custom 404 handler per group (groups do not inherit app hooks).

**Decision: `defineHandler` over per-handler plumbing** (2026-10-15). The four-overload signature gives `run` exactly the declared inputs without casts; the implementation signature is loose on purpose. Consequence: adding an endpoint is a contract plus one expression. Rejected: a request-scoped `HttpEvent` service (hidden dependency, async body read inside the Effect) and a single options type with optional params/body (leaks `undefined` into every `run`).

**Decision: Effect owns shutdown** (2026-10-15). srvx's signal handler is off, so finalizer order is deterministic: server drain, database, log flush. Not exercised against a live socket yet (the sandbox blocks port binding); to verify, run `pnpm app serve`, send `SIGTERM`, and confirm the shutdown log lines still appear.

**Decision: services as `Context.Service` classes with `static layer`** (2026-10-15). `DatabaseService` → `UserRepository` → `UserService`, composed with `Layer.provideMerge` in `src/kernel/layers.ts` (`AppLayer`). Each level stays visible, so `migrate:*` needs only `DatabaseService` while `serve` takes the full stack. The user cache is private to `UserService.layer` rather than a separate service nobody else uses. Rejected: free functions reading `DatabaseService` from context (no seam to substitute the repository in a test).

**Decision: TypeID for request ids** (2026-10). `typeid('req')` (UUIDv7-based, sortable, prefixed) via `requestId` middleware; inbound `x-request-id` <= 128 chars is echoed for gateway tracing. Written to `res.headers` **and** `res.errHeaders` because h3 merges only the latter into error responses. Library: `typeid-js`.

**Decision: read-through cache only for hot single-row reads** (2026-10). `UserService.get` goes through an Effect `Cache` (capacity 256, TTL 30s, resolver-backed, `src/service/user_service.ts`); `list` and writes go straight to the repository. Consequence: reads may be up to 30s stale — acceptable for a reference server; a real deployment would revisit per entity.

## Configuration

**Decision: Effect `Config` schema, fail fast at layer build** (2026-10). All env parsing lives in `src/kernel/config.ts` (`ConfigLayer`); present-but-invalid values fail with a typed `ConfigError` while the layer builds, so a bad `PORT` or a `CORS_CREDENTIALS=true` + wildcard-origins combination dies at startup, never mid-request. Rejected: `process.env` reads at call sites (untestable, no single validation point). Consumers depend on the `ConfigService` context tag, not the layer.

## Observability

**Decision: batched, buffered stdout logger** (2026-10-15). `src/observer/logger.ts` builds the sink with `Logger.batched`: formatting stays on the calling fiber, the line goes into memory, and one detached fiber writes the whole buffer per `LOG_FLUSH_INTERVAL` (default 250 ms). Why: Effect's console loggers write synchronously per line, which puts terminal and pipe latency on the request path. Consequence: a hard crash can drop up to one window of lines; graceful shutdown drains the buffer in the scope finalizer. Formats are `pretty` (own renderer over `Logger.formatStructured`, colours only on a TTY and without `NO_COLOR`) and `json`. Rejected: `Logger.consolePretty` (synchronous, cannot be batched) and a worker-thread sink (extra moving part, no benefit at this volume).

**Decision: one observer plugin for request logs and metrics** (2026-10-15). `httpObserver` reads the final status from `onResponse`/`onError`, so metrics also count 404s and h3-level errors, which the old per-`runEffect` counter missed. `src/observer/` is where tracing exporters and further instruments land; nothing is exported yet.

## Database

**Decision: `node:sqlite` + custom Kysely dialect** (2026-10). Zero native addons — the SEA binary and the bundle carry no compiled `better-sqlite3`. `src/database/dialect/` implements the Kysely dialect/driver/connection over `DatabaseSync`, with a mutex for serialisation. Consequence: single-process SQLite only; scaling out means swapping the dialect. Rejected: `better-sqlite3` (native addon breaks the no-`node_modules` runtime story).

**Decision: static migration registry over file scanning** (2026-10). Migrations register in `src/database/migrations/index.ts` instead of `FileMigrationProvider`'s runtime `readdir`. Why: the Rolldown bundle inlines every migration (no `migrations/` folder to ship), and static imports cannot be tree-shaken away. Consequence: two places to touch per migration (file + registry) — contract in `rules.md`. Kysely's `Migrator` still owns the `kysely_migration` bookkeeping.

**Decision: thin CLI wrappers over migrator capabilities** (2026-10-15). `migrate:up/down/status/reset` map to `Migrator.migrateToLatest/migrateTo/getMigrations`; `migrateDown(steps)` is built on `migrateTo` because Kysely's native `migrateDown` is single-step. `migrate:validate` and `migrate:create` were **skipped on purpose**: Kysely validates migration ordering internally, and file scaffolding is not a runtime capability. Seeders are a separate named registry (`src/database/seeder.ts`) with idempotency as a contract, not a Kysely concern.

## Build pipeline

**Decision: own Rolldown pipeline, independent of `src/`** (2026-10). `builder/` bundles the server (ESM + chunks, per-package splitting), keeps native packages external and traces them, emits a minimal `package.json`, and optionally produces a single executable via Node SEA + postject. Consequence: two build modes share one config surface (`builder/builder.config.ts`, every option defaulted). Rejected: adopting Nitro/tsup (heavier, less control over SEA injection).

## Testing (gap record)

**No test suite** (2026-10-15). `package.json` `test` is a placeholder. Validation currently is `tsc -b --noEmit` + `oxfmt`/`oxlint` + manual runtime probes. The composition root (`AppRuntime`), `runEffect` mapping, and the migrator commands are the first candidates when tests arrive — they are exercised only by probes today. Record: `index.md` recap; trigger to act: first test-framework decision.
