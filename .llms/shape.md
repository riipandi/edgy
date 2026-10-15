# Repository shape

The layout, the toolchain, and the commands. Read once; return when a path or a command is needed.

## Stack

- Node.js >= 24.22 (native TypeScript stripping — source runs directly, no build step in development), pnpm 12 (`devEngines`; `npx` rejected)
- Effect v4 (typed errors, DI layers, CLI, Config, Logger, Schema, Cache, Metric)
- h3 v2 (plugin-based routing, rou3 trie)
- Kysely 0.29 on `node:sqlite` (zero native addons)
- oxfmt + oxlint for formatting/linting, `tsc -b --noEmit` for typecheck, Rolldown for bundling

## Layout

```text
src/
  main.ts            # CLI entry (run by Node directly); the only Effect.provide
  app.ts             # createApp(options): global plugins + route groups
  server.ts          # serveHttp: captures the HttpRuntime, starts h3 inside a scope
  kernel/            # config.ts (ConfigService), errors.ts (AppError union), pagination.ts (Page, PageRequest), layers.ts (CoreLayer, AppLayer)
    http/            # runtime.ts (HttpRuntime bridge), handler.ts (defineHandler, definePagedHandler, defineMessageHandler), router.ts (defineRouteGroup), responder.ts (runEffect), envelope.ts (response envelope), pagination.ts (query schema, metadata, links), decode.ts, inflight.ts, h3_error.ts
  observer/          # logger.ts (non-blocking batched sink), metrics.ts, http_observer.ts (request log + metrics)
  command/           # effect/cli commands (cli.ts + one file per command + helper.ts)
  routes/            # route.ts: the route table (groups, root routes, catch-all, registration order)
  middleware/        # cors, request_id, body_limit, cache_control
  handler/           # one defineHandler per endpoint, thin
  service/           # UserService (Context.Service + layer; owns the private user cache)
  repository/        # one *_repo.ts per resource: UserRepository (Context.Service + layer; Kysely queries)
  schemas/           # Effect Schema per resource (entity, request/response, Kysely table type); database.ts aggregates tables
  database/
    dialect/         # NodeSQLiteDialect over node:sqlite (+ connection, driver, mutex)
    service.ts       # DatabaseService (db + query helper) and its layer
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
- Handler programs are `Effect<A, AppError, HttpEnv>`; handlers stay thin and are declared with `defineHandler` (`src/kernel/http/handler.ts`), which delegates to `runEffect`
- DI by `Context.Service` with a `static layer` on the class; layers are composed in `src/kernel/layers.ts` (`CoreLayer` once in `main.ts`, `AppLayer` per command). There is no global runtime
- Service methods use `Effect.fn('Service.method')` so every call gets a span
- `Effect.provide(layer)` appears only at the entry point (`src/main.ts`, lint rule `effecttsgo/strict-effect-provide`); per-command layers go through `Command.provide`. Argument checks use `ensure` (`src/command/helper.ts`), not a bare `return` next to `return yield*`
- Route groups are h3 plugins (`defineRouteGroup`); global middleware runs in registration order (`src/app.ts`: provideRuntime → cors → requestId → httpObserver → bodyLimit) and is registered before groups mount
- Comments carry a why/contract/trap, never restate the next line
- Prose: `.llms/` is for agents (technical, file:line evidence); `docs/` is for humans (no internals, no paths); tree documents are English, no hard wrapping
