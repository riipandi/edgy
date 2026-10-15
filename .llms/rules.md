# Rules

Contracts, how-to-change recipes, traps. Read the section a change touches before touching it.

## HTTP contracts

- **Error mapping is by tag** (`src/kernel/http/responder.ts`, `toErrorResponse`): `ValidationError` → 400 with `{error:'Validation failed', issues}`, `NotFound` → 404 `{error,id}`, `Conflict` → 409 `{error:'User already exists'}`, `RequestTimeout` → 504, `DatabaseError` → 500 `{error:'Database error'}`, a defect → 500 `{error:'Internal server error'}`, an interrupted fiber (client hung up) → 499 `{error:'Request cancelled'}`. The switch ends in `satisfies never`, so a new `AppError` member fails to compile until it has a branch. `DatabaseError` and defects are logged with their cause; expected failures and interruptions are not logged as errors (the observer still logs the request line at the level of its status).
- **Errors raised by h3 use the same `{ error }` shape.** `createApp` sets `onError: renderH3Error` (`src/kernel/http/h3_error.ts`); it copies `event.res.errHeaders` into the `Response` it builds, because h3 does not merge them into a response returned from the hook. Unhandled exceptions are rendered as `Internal server error`. Unknown paths are answered by the `notFoundRoutes` catch-all (`src/routes/route.ts`), which **throws** an `HTTPError`: h3's `onResponse` middleware (the observer uses it) converts h3's internal not-found marker with a default config, bypassing `onError`. Keep that catch-all registered last.
- **`AppError` is a closed union** (`src/kernel/errors.ts`): `NotFound | ValidationError | DatabaseError | Conflict | RequestTimeout`. Handlers accept `Effect<A, E extends AppError, HttpEnv>`; widening the union means editing `errors.ts` (member) and `responder.ts` (status mapping) in the same change.
- **One runtime, no singleton.** `serveHttp` captures the command's service context into an `HttpRuntime` (`src/kernel/http/runtime.ts`) and `createApp` attaches it to every request through the `provideRuntime` plugin; `runEffect` and the observer read it with `runtimeOf(event)`. Never build a second `ManagedRuntime` — it would open a second database connection and logger. `HttpEnv` lists the services a handler may require (`UserService`, `DatabaseService`); add a service there before a handler uses it.
- **Endpoints are declared with `defineHandler`** (`src/kernel/http/handler.ts`): `{ params?, body?, response, status?, run }`. The helper reads the body, decodes router params and body, runs the program, and encodes the response; `run` receives exactly the inputs the spec declared. Handlers do not call `runEffect`, `readBody` or `decode` themselves.
- **Request lifecycle limits.** `runEffect` passes `event.req.signal` to the runtime, so a client that disconnects interrupts the fiber; it wraps the program in `Effect.timeoutOrElse` with `REQUEST_TIMEOUT` (→ `RequestTimeout`, 504); `bodyLimit(BODY_LIMIT)` rejects oversized bodies with 413 as they are read. Field bounds live in the schemas (`email` ≤ 254, `name` ≤ 200).
- **Health**: `GET /` is a static liveness check; `GET /health` is readiness and answers 200 only if `DatabaseService.ping` succeeds (otherwise 500 `Database error`).
- **Validation runs inside the Effect program** (`decode` in `src/kernel/http/decode.ts`): a body or router-params failure is a `ValidationError` (400 with issues). Malformed JSON never reaches the program — h3's `readBody` rejects it with its own 400.
- **Schemas are per resource and derived** (`src/schemas/<resource>_schema.ts`): one entity `Struct` (`UserSchema`, with its inferred type `User`) is the source; request schemas (`UserCreateRequestSchema`, `UserIdParamsSchema`), response schemas (`UserGetResponseSchema`, `UserListResponseSchema`, `UserCreateResponseSchema`) and the Kysely table type (`UsersTable`, `Omit<User,'id'>` plus `Generated<number>`) come from it. Domain code uses the inferred types (`User`, `UserCreateRequest`); no hand-written row or input interfaces.
- **Responses are encoded through their schema.** `runEffect` requires `options.response`; only declared fields reach the client, so a column added to the table does not leak through `selectAll()`. An encode failure is a defect (500). Database rows are not decoded on read — the migration owns their shape; add a decode in the repository only for a column that needs a transformation.
- **Create answers `201`** (`runEffect(..., { successStatus: 201 })`).
- **Request ID**: minted by `requestId` middleware as TypeID `req_…` (TypeID v7), inbound `x-request-id` echoed when <= 128 chars. Written to both `res.headers` and `res.errHeaders` because h3 merges only the latter into error responses (`src/middleware/request_id.ts`). Never drop the `errHeaders` write.
- **Middleware order is a contract** (`src/app.ts`): `provideRuntime` → `cors` → `requestId` → `httpObserver` → `bodyLimit`, registered before route groups mount, so the runtime exists for everyone, preflight is answered early, the observer can read the id, and a rejected body is still logged and carries the id. Reordering breaks the observer and the runtime lookup.
- **Route groups** (`src/routes/group.ts`): a group owns an isolated `H3` instance mounted at `prefix`; its middleware runs only for its routes. Group routes are written relative to the prefix. Mounted groups merge into the parent rou3 trie — no nested fetch hop. App-level config/hooks do not flow into a mounted app; shared behaviour goes in global middleware.

## Naming conventions

- **A schema value ends in `Schema`; the type inferred from it does not.** `UserSchema` is the value, `User` is `typeof UserSchema.Type`. Value and type never share a name, so an import tells you which one you hold. Applies to entity, request, response and params schemas alike: `UserCreateRequestSchema`, `UserGetResponseSchema`, `UserIdParamsSchema`.
- **Pattern for wire contracts**: `<Resource><Action><Request|Response>Schema`, `<Resource>IdParamsSchema` for router params. `Request`/`Response` in a name always means HTTP; the user-lookup cache key is `UserLookup` for that reason.
- **Export a type only when code consumes it.** Do not add `XEncoded`/`XResponse` types speculatively. When a schema transforms (a `Date` that goes out as a string), export `typeof XSchema.Encoded` as `X…Encoded` next to it — `Type` is the domain shape, `Encoded` is the wire shape.
- **Derive, do not repeat**: request and response schemas reuse the entity's fields (`UserSchema.fields.email`) or derive with `mapFields`; the Kysely table type is `Omit<Entity, 'id'>` plus `Generated<…>`.
- **Exceptions, on purpose**: the error envelopes (`ErrorResponse`, `ValidationErrorResponse`) are plain interfaces because the responder builds them and nothing decodes or encodes them; `Config` declarations in `src/kernel/config.ts` are not `Schema` values and keep lower-case local names.
- **File suffixes**: `*_schema.ts`, `*_repo.ts`, `*_service.ts`, `*_handler.ts`, one per resource; the class inside keeps the `UserRepository`/`UserService` form because it is a service tag, not a schema.

## Observability contracts

- **The logger never blocks a request** (`src/observer/logger.ts`): lines are formatted on the calling fiber and pushed into an in-memory buffer; a detached fiber writes the buffer to stdout once per `LOG_FLUSH_INTERVAL` in a single `write`. The scope finalizer drains the rest, so graceful shutdown (`SIGINT`/`SIGTERM` through `NodeRuntime.runMain`) loses nothing; a hard crash loses at most one window. Do not log with `console.*` from services — use `Effect.log*`. CLI user output (`print` in `src/command/helper.ts`) is not a log and stays direct.
- **Log config** is `LOG_LEVEL`, `LOG_FORMAT` (`pretty` | `json`) and `LOG_FLUSH_INTERVAL`, parsed in `src/kernel/config.ts`. `LoggerLayer` replaces Effect's default logger; merging would print every line twice.
- **Request logs and metrics come from one plugin** (`src/observer/http_observer.ts`), so the counter `http_requests_total` and the timer `http_request_duration_ms` (both labelled `method`, `status`) cover every response, including 404s and h3-level errors. New instruments live in `src/observer/metrics.ts`. No exporter is wired yet.

## Shutdown contract

- `SIGINT`/`SIGTERM` reach `NodeRuntime.runMain`, which interrupts the `serve` fiber. srvx's own signal handler is disabled (`gracefulShutdown: false` in `src/server.ts`) so the scope owns the order: stop accepting and drain in-flight requests (bounded by `SHUTDOWN_TIMEOUT`, then `close(true)`), release the database, flush the log buffer last. Do not re-enable srvx's handler — two handlers race the finalizers and can drop buffered log lines.

## CLI contracts

- **Commands are flat, colon-named**: `serve`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:seed` (`src/command/`, wired in `cli.ts`). One file per command; `helper.ts` holds the shared CLI output helpers (`print`, `printWarning` — plain console output, no timestamp/level prefix) and the destructive-op confirmation (`confirmDestructive`).
- **Destructive commands** (`migrate:down`, `migrate:reset`) prompt via `Prompt.Confirm`; `--force` skips the prompt, and a non-TTY session without `--force` refuses to run (`src/command/helper.ts`). Keep this pairing on any new destructive command.
- **`--dry-run`** must not touch the database beyond reads (`getMigrationInfos`).
- **`serve --auto-migrate`** runs `migrateToLatest` before the server starts and never seeds (`src/command/serve.ts`). The command provides `AppLayer`; migrate commands provide `DatabaseService.layer`. `Effect.provide` with a layer is reserved for `main.ts` (lint rule `effecttsgo/strict-effect-provide`).
- `migrate:reset --seed` requires `--up`; `migrate:down --count` must be >= 1 — both enforced with `CliError.UserError` in the handler.
- `--to` on `migrate:up` takes a **migration name** (not a numeric version).

## Database contracts

- **Migrations are a static registry** (`src/database/migrations/index.ts`), not a directory scan: keys are `NNNNN_name` (zero-padded prefix, sorts in execution order), each file exports `up` (+ optional `down`). Registry keys must match the file's export binding; a new migration adds the file **and** registers it in `index.ts` — an unregistered file silently never runs.
- **Kysely owns the bookkeeping**: tables `kysely_migration` / `kysely_migration_lock`. Never hand-edit them; `migrate:status` reads state via `Migrator.getMigrations()`.
- **`migrateDown(steps)`** resolves the target name from the executed list and delegates to `migrateTo` (Kysely's `migrateDown` is one-step only) — `src/database/migrator.ts`. The DB must be reachable to compute the target.
- **Seeders are idempotent** by contract (`src/database/seeder.ts` registry; e.g. `onConflict doNothing`). A seeder that is not idempotent breaks every re-run (`migrate:reset --seed`, repeated `migrate:seed`).
- **Schema ownership**: `src/schemas/database.ts` is the Kysely `Database` type (tables/columns used in queries); a migration changing the schema updates this type in the same change, or `typecheck` drifts from reality.
- **Connection lifecycle** lives in `DatabaseService.layer` (`src/database/service.ts`): opens `node:sqlite` once per scope, creates the parent directory, destroys on scope close. Nothing else may open a connection. On open it sets a 5 s busy timeout and `journal_mode = WAL` (not for `:memory:`), so `migrate:*` and the server can share one file; WAL leaves `-wal`/`-shm` files next to the database.
- **The driver is synchronous** (`node:sqlite`): every query blocks the event loop for its duration. Fine for this workload; a long query or migration stalls requests, which is the known ceiling of the single-process design.
- **Uniqueness violations are a domain error.** `isUniqueViolation` (`src/database/service.ts`) recognises SQLite codes 2067 and 1555 on the `DatabaseError` cause; the repository turns them into `Conflict`. Other constraint failures stay `DatabaseError` until a route needs them mapped.
- **Queries go through `DatabaseService.query`**, which maps any rejection to `DatabaseError`. Repositories, the migrator and seeders do not call `Effect.tryPromise` themselves.

## How to change it

- **New endpoint**: schema (`schemas/<resource>_schema.ts`: entity, request and response schemas; a new table also needs a migration + registry entry) → repository (`repository/<resource>_repo.ts`, a `Context.Service` with `static layer`) → service (`service/`, same shape) → add both layers to `AppLayer` in `src/kernel/layers.ts` and the service to `HttpEnv` → handler (`handler/`, one `defineHandler` per endpoint; declare `params`/`body`/`response`) → route group entry (`routes/route.ts`) → `docs/api-endpoint.md` row in the same commit.
- **New CLI command**: `src/command/<name>.ts` (`Command.make` + flags + handler) → register in `command/cli.ts` `withSubcommands` → `docs/commandline.md` entry in the same commit. Destructive? Add `--force` + `confirmDestructive` (`src/command/helper.ts`).
- **New config key**: parse in `src/kernel/config.ts` schema (with default and validation) → expose on `AppConfig` → `docs/configuration.md` row in the same commit. CORS credentials invariants: credentials=true with wildcard origins fails at startup (`src/kernel/config.ts`).
- **New migration**: `src/database/migrations/NNNNN_name.ts` exporting `up`/`down` → register in `migrations/index.ts` → run `pnpm app migrate:up`.

## Traps

- **No test suite**: `pnpm test` is a placeholder. Do not claim "tests pass"; validate with `pnpm typecheck`, `pnpm check`, and a runtime probe (fresh `DATABASE_PATH`, migrate, then either curl or an in-process `createApp(...).fetch(new Request(...))` under `CoreLayer` + `AppLayer`). A green typecheck does not exercise the composition root. A sandbox that forbids port binding rejects `serve` with `EPERM`; use the in-process probe there.
- **Edit races**: never batch multiple `edit_file` calls to the same file in one parallel block — one edit is silently lost. Sequential per file, verify after.
- **`exactOptionalPropertyTypes` is on**: optional properties in response/error types must be explicitly `| undefined`-compatible; Effect `Option` values from `Flag.optional` need `Option.isSome` before `.value`.
- **Effect v4 vs v3 docs**: this repo is Effect **v4** (`effect@4.0.4`) — v3-era APIs (`Effect.zipRight` as a standalone combinator name, old `Command`/`Prompt` shapes) do not match; the pinned `node_modules` types are the truth.
- **`node --watch` + CLI commands**: `pnpm watch` hard-codes `serve`; other commands are run via `pnpm app <command>`.

## Plan documents

A plan (`.llms/plans/plan-YYYYMMDD_HHMM.md`) is a contract with fixed shape — frontmatter (`status`, `updated`, `phases` with per-phase `status`/`note`), Objective, Current state (verified file:line facts), Decisions (dated, rejected alternatives named), execution rules, Phases (each with an objectively checkable validation line and a suggested commit message), test matrix, out-of-scope. It executes only on the owner's explicit instruction ("continue with phase N"); one atomic commit per phase; after the last phase, stop and recommend the closing commit message — never commit it unasked. Full spec: the `agent-docs` skill.
