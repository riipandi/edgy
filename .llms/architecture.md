# Architecture

Per-area reasoning and decision records. Read the section before changing that area.

## HTTP layer

**Decision: h3 plugins as the only composition primitive** (2026-10). Global middleware, route groups, and per-route behaviour are all `H3Plugin`s, composed in one place (`src/app.ts` → `createApp`). `defineGroup` (`src/routes/group.ts`) gives each group an isolated router mounted at a prefix; `mount` merges routes into the parent rou3 trie, so there is one lookup and no nested fetch hop. Consequence: app-level config/hooks do not inherit into mounted groups — that is accepted, shared behaviour goes in global middleware. Rejected: flat route tables (prefix boilerplate, group-wide middleware impossible) and nested `H3.fetch` delegation (extra hop, no trie merge).

**Decision: `runEffect` bridge, error mapping by tag** (2026-10). Handlers stay thin async H3 handlers that delegate to `runEffect(event, effect)` (`src/httputils/responder.ts`), which runs the program on the shared `AppRuntime`, records `http_requests_total` + `http_request_duration_ms` metrics, opens a span per request, and maps `AppError` tags to statuses. Consequence: `responder.ts` is the single place that knows HTTP; services stay transport-free. Rejected: per-handler try/catch mapping (drift) and middleware-level catch-alls (cannot narrow typed errors).

**Decision: TypeID for request ids** (2026-10). `typeid('req')` (UUIDv7-based, sortable, prefixed) via `requestId` middleware; inbound `x-request-id` <= 128 chars is echoed for gateway tracing. Written to `res.headers` **and** `res.errHeaders` because h3 merges only the latter into error responses. Library: `typeid-js`.

**Decision: read-through cache only for hot single-row reads** (2026-10). `getUser` goes through an Effect `Cache` (`UserCache`, capacity 256, TTL 30s, resolver-backed, `src/service/user_service.ts`); `listUsers` and writes go straight to the store. Consequence: reads may be up to 30s stale — acceptable for a reference server; a real deployment would revisit per entity.

## Configuration

**Decision: Effect `Config` schema, fail fast at layer build** (2026-10). All env parsing lives in `src/config.ts` (`ConfigLayer`); present-but-invalid values fail with a typed `ConfigError` while the layer builds, so a bad `PORT` or a `CORS_CREDENTIALS=true` + wildcard-origins combination dies at startup, never mid-request. Rejected: `process.env` reads at call sites (untestable, no single validation point). Consumers depend on the `ConfigService` context tag, not the layer.

## Database

**Decision: `node:sqlite` + custom Kysely dialect** (2026-10). Zero native addons — the SEA binary and the bundle carry no compiled `better-sqlite3`. `src/database/dialect/` implements the Kysely dialect/driver/connection over `DatabaseSync`, with a mutex for serialisation. Consequence: single-process SQLite only; scaling out means swapping the dialect. Rejected: `better-sqlite3` (native addon breaks the no-`node_modules` runtime story).

**Decision: static migration registry over file scanning** (2026-10). Migrations register in `src/database/migrations/index.ts` instead of `FileMigrationProvider`'s runtime `readdir`. Why: the Rolldown bundle inlines every migration (no `migrations/` folder to ship), and static imports cannot be tree-shaken away. Consequence: two places to touch per migration (file + registry) — contract in `rules.md`. Kysely's `Migrator` still owns the `kysely_migration` bookkeeping.

**Decision: thin CLI wrappers over migrator capabilities** (2026-10-15). `migrate:up/down/status/reset` map to `Migrator.migrateToLatest/migrateTo/getMigrations`; `migrateDown(steps)` is built on `migrateTo` because Kysely's native `migrateDown` is single-step. `migrate:validate` and `migrate:create` were **skipped on purpose**: Kysely validates migration ordering internally, and file scaffolding is not a runtime capability. Seeders are a separate named registry (`src/database/seeder.ts`) with idempotency as a contract, not a Kysely concern.

## Build pipeline

**Decision: own Rolldown pipeline, independent of `src/`** (2026-10). `builder/` bundles the server (ESM + chunks, per-package splitting), keeps native packages external and traces them, emits a minimal `package.json`, and optionally produces a single executable via Node SEA + postject. Consequence: two build modes share one config surface (`builder/builder.config.ts`, every option defaulted). Rejected: adopting Nitro/tsup (heavier, less control over SEA injection).

## Testing (gap record)

**No test suite** (2026-10-15). `package.json` `test` is a placeholder. Validation currently is `tsc -b --noEmit` + `oxfmt`/`oxlint` + manual runtime probes. The composition root (`AppRuntime`), `runEffect` mapping, and the migrator commands are the first candidates when tests arrive — they are exercised only by probes today. Record: `index.md` recap; trigger to act: first test-framework decision.
