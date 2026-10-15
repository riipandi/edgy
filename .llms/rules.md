# Rules

Contracts, how-to-change recipes, traps. Read the section a change touches before touching it.

## HTTP contracts

- **Error mapping is by tag** (`src/httputils/responder.ts`, `runEffect`): `ValidationError` → 400 with `{error:'Validation failed', issues}`, `NotFound` → 404 `{error,id}`, `DatabaseError` → 500 `{error:'Database error'}`, `ConfigError` → 500, anything else → 500 `{error:'Internal server error'}`. A new `AppError` member must add its branch here or it falls to the generic 500.
- **`AppError` is a closed union** (`src/httputils/errors.ts`): `NotFound | ValidationError | DatabaseError`. Handlers accept `Effect<A, E extends AppError, AppEnv>`; widening the union means editing `errors.ts` (member + response shape) and `responder.ts` (status mapping) in the same change.
- **Request ID**: minted by `requestId` middleware as TypeID `req_…` (TypeID v7), inbound `x-request-id` echoed when <= 128 chars. Written to both `res.headers` and `res.errHeaders` because h3 merges only the latter into error responses (`src/middleware/request_id.ts`). Never drop the `errHeaders` write.
- **Middleware order is a contract** (`src/app.ts`): `cors()` → `requestId()` → `requestLogger()`, registered before route groups mount, so preflight is answered first and the logger can read the id. Reordering breaks both.
- **Validation** uses h3's `readValidatedBody`/`getValidatedRouterParams` with Standard Schema adapters from `src/httputils/validator.ts`; the failure surfaces as `ValidationError` through `runEffect`.
- **Route groups** (`src/routes/group.ts`): a group owns an isolated `H3` instance mounted at `prefix`; its middleware runs only for its routes. Group routes are written relative to the prefix. Mounted groups merge into the parent rou3 trie — no nested fetch hop. App-level config/hooks do not flow into a mounted app; shared behaviour goes in global middleware.

## CLI contracts

- **Commands are flat, colon-named**: `serve`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:seed` (`src/command/`, wired in `cli.ts`). One file per command; `confirm.ts` holds the shared destructive-op confirmation.
- **Destructive commands** (`migrate:down`, `migrate:reset`) prompt via `Prompt.Confirm`; `--force` skips the prompt, and a non-TTY session without `--force` refuses to run (`src/command/confirm.ts`). Keep this pairing on any new destructive command.
- **`--dry-run`** must not touch the database beyond reads (`getMigrationInfos`).
- **`serve --auto-migrate`** runs `migrateToLatest` before the server starts and never seeds (`src/command/serve.ts`).
- `migrate:reset --seed` requires `--up`; `migrate:down --count` must be >= 1 — both enforced with `CliError.UserError` in the handler.
- `--to` on `migrate:up` takes a **migration name** (not a numeric version).

## Database contracts

- **Migrations are a static registry** (`src/database/migrations/index.ts`), not a directory scan: keys are `NNNNN_name` (zero-padded prefix, sorts in execution order), each file exports `up` (+ optional `down`). Registry keys must match the file's export binding; a new migration adds the file **and** registers it in `index.ts` — an unregistered file silently never runs.
- **Kysely owns the bookkeeping**: tables `kysely_migration` / `kysely_migration_lock`. Never hand-edit them; `migrate:status` reads state via `Migrator.getMigrations()`.
- **`migrateDown(steps)`** resolves the target name from the executed list and delegates to `migrateTo` (Kysely's `migrateDown` is one-step only) — `src/database/migrator.ts`. The DB must be reachable to compute the target.
- **Seeders are idempotent** by contract (`src/database/seeder.ts` registry; e.g. `onConflict doNothing`). A seeder that is not idempotent breaks every re-run (`migrate:reset --seed`, repeated `migrate:seed`).
- **Schema ownership**: `src/schemas/database.ts` is the Kysely `Database` type (tables/columns used in queries); a migration changing the schema updates this type in the same change, or `typecheck` drifts from reality.
- **Connection lifecycle** lives in `DatabaseLayer` (`src/database/runtime.ts`): opens `node:sqlite` once per process, creates the parent directory, destroys on scope close. Nothing else may open a connection.

## How to change it

- **New endpoint**: schema (if a new table: migration + registry + `database.ts` type) → store (`stores/`) → service (`service/`, may reuse `DatabaseService`/`UserCache`) → handler (`handler/`) → route group entry (`routes/route.ts`) → error mapping branch if a new `AppError` member → `docs/api-endpoint.md` row in the same commit.
- **New CLI command**: `src/command/<name>.ts` (`Command.make` + flags + handler) → register in `command/cli.ts` `withSubcommands` → `docs/commandline.md` entry in the same commit. Destructive? Add `--force` + `confirmDestructive`.
- **New config key**: parse in `src/config.ts` schema (with default and validation) → expose on `AppConfig` → `docs/configuration.md` row in the same commit. CORS credentials invariants: credentials=true with wildcard origins fails at startup (`src/config.ts`).
- **New migration**: `src/database/migrations/NNNNN_name.ts` exporting `up`/`down` → register in `migrations/index.ts` → run `pnpm app migrate:up`.

## Traps

- **No test suite**: `pnpm test` is a placeholder. Do not claim "tests pass"; validate with `pnpm typecheck`, `pnpm check`, and a runtime probe (fresh `DATABASE_PATH`, migrate, curl). A green typecheck does not exercise the composition root.
- **Edit races**: never batch multiple `edit_file` calls to the same file in one parallel block — one edit is silently lost. Sequential per file, verify after.
- **`exactOptionalPropertyTypes` is on**: optional properties in response/error types must be explicitly `| undefined`-compatible; Effect `Option` values from `Flag.optional` need `Option.isSome` before `.value`.
- **Effect v4 vs v3 docs**: this repo is Effect **v4** (`effect@4.0.4`) — v3-era APIs (`Effect.zipRight` as a standalone combinator name, old `Command`/`Prompt` shapes) do not match; the pinned `node_modules` types are the truth.
- **`node --watch` + CLI commands**: `pnpm watch` hard-codes `serve`; other commands are run via `pnpm app <command>`.

## Plan documents

A plan (`.llms/plans/plan-YYYYMMDD_HHMM.md`) is a contract with fixed shape — frontmatter (`status`, `updated`, `phases` with per-phase `status`/`note`), Objective, Current state (verified file:line facts), Decisions (dated, rejected alternatives named), execution rules, Phases (each with an objectively checkable validation line and a suggested commit message), test matrix, out-of-scope. It executes only on the owner's explicit instruction ("continue with phase N"); one atomic commit per phase; after the last phase, stop and recommend the closing commit message — never commit it unasked. Full spec: the `agent-docs` skill.
