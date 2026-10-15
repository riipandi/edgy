# Repository shape

The layout, the toolchain, and the commands. Read once; return when a path or a command is needed.

## Stack

- Node.js >= 24.21 (native TypeScript stripping — source runs directly, no build step in development), pnpm 12 (`devEngines`; `npx` rejected)
- Effect v4 (typed errors, DI layers, CLI, Config, Logger, Schema, Cache)
- h3 v2 (plugin-based routing, rou3 trie)
- Kysely 0.29 on `node:sqlite` (zero native addons)
- oxfmt + oxlint for formatting/linting, `tsc -b --noEmit` for typecheck, Rolldown for bundling

## Layout

```text
src/
  main.ts            # CLI entry (run by Node directly)
  app.ts             # composition root: global plugins + route groups
  server.ts          # h3 serve + Effect lifecycle
  config.ts          # ConfigService (validated env config, ConfigLayer)
  runtime.ts         # ObservabilityLayer, DatabaseLayer, CacheLayer, MainLayer, AppRuntime
  command/           # effect/cli commands (cli.ts + one file per command + confirm.ts)
  routes/            # group.ts (defineGroup plugin), route.ts (groups + registration order)
  middleware/        # cors, request_id, request_logger, cache_control
  handler/           # H3 event handlers, thin
  service/           # Effect programs (business logic), user_service owns UserCache
  stores/            # Kysely queries
  schemas/           # Effect Schema: database.ts (table types), user_schema.ts
  httputils/         # errors.ts (AppError union), responder.ts (runEffect), validator.ts
  database/
    dialect/         # NodeSQLiteDialect over node:sqlite (+ connection, driver, mutex)
    migrator.ts      # Migrator wiring: getMigrationInfos, migrateToLatest, migrateTo, migrateDown
    migrations/      # index.ts static registry + one file per migration
    seeder.ts        # named seeder registry + runSeeders
    seeders/         # one file per seeder (idempotent)
builder/             # Rolldown build pipeline, independent of src/
bin/edgy.mjs         # published bin shim
docs/                # human-facing docs: commandline.md, configuration.md, api-endpoint.md
```

## Commands

- `pnpm app <command> [flags]` — run the CLI from source (`node ./src/main.ts`)
- `pnpm typecheck` — `tsc -b --noEmit`
- `pnpm check` — `oxfmt --check && oxlint`
- `pnpm format` — `oxfmt --write .`
- `pnpm build` / `pnpm compile` — Rolldown bundle / single executable (SEA)
- `pnpm test` — **placeholder, no test suite**; validation is typecheck + check + a runtime probe against a fresh DB (`DATABASE_PATH=$(mktemp -d)/x.db pnpm app migrate:up`, then curl)

## Conventions

- **TypeScript strict**, `.ts` extension on relative imports (Node type stripping)
- Effects are typed `Effect<A, AppError, AppEnv>`; handlers stay thin and delegate to `runEffect` (`src/httputils/responder.ts`)
- DI by `Context.Service` + `Layer`; the composition root is `src/runtime.ts` (`AppRuntime`)
- Route groups are h3 plugins (`defineGroup`); global middleware runs in registration order (`src/app.ts`: cors → requestId → requestLogger) and is registered before groups mount
- Comments carry a why/contract/trap, never restate the next line
- Prose: `.llms/` is for agents (technical, file:line evidence); `docs/` is for humans (no internals, no paths); tree documents are English, no hard wrapping
