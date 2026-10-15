# Repository shape

The layout, the toolchain, and the commands. Read once; return when a path or a command is needed.

## Stack

- Node.js >= 24.22 (native TypeScript stripping — source runs directly, no build step in development), pnpm 12 (`devEngines`; `npx` rejected)
- Effect v4 (typed errors, DI layers, CLI, Config, Logger, Schema, Cache, Metric)
- h3 v2 (plugin-based routing, rou3 trie)
- Kysely 0.29 on `node:sqlite` (zero native addons) or Cloudflare D1 (`DATABASE_DRIVER`)
- oxfmt + oxlint for formatting/linting, `tsc -b --noEmit` + `mtc` (Marko templates) for typecheck, Vite 8 (Rolldown) for every bundle, Vitest for tests, wrangler (through the Cloudflare Vite plugin) for Workers
- Pages: Marko 6 templates (`@marko/vite`) and vanilla-extract styles (`.css.ts`), server-rendered and streamed, hydrated only where interactive

## Layout

```text
src/
  main.ts            # Node CLI entry (run by Node directly); the only Effect.provide
  worker.ts          # Cloudflare Workers entry: builds one runtime per isolate
  app.ts             # createApp({ runtime, config }): global plugins + route table
  server.ts          # serveHttp: captures the HttpRuntime, starts h3 inside a scope
  layers.ts          # AppLayer (Node): configured database + services
  services.ts        # ServicesLayer: every module's repos and services (portable)
  kernel/            # runtime-agnostic core
    config/          # service.ts (ConfigService, appConfig), field.ts (field helpers), one section file each (server, database, logging, security, observability, cors), example.ts (.env.example renderer)
    cache/           # read_through.ts (makeReadThrough, CacheBypass), guard.ts (fail-open store decorator), local.ts (memory), edge_cache.ts (Workers Cache API)
    fail_open.ts     # the shared fail-open state machine (cooldown, one probe)
    redact.ts        # redactText / redactValue: secrets out of anything shown or logged
    objectids.ts     # defineId: declares one TypeID kind (prefix, make, schema); the prefixes live beside what they identify
    errors.ts        # AppError interface + NotFound, ValidationError, DatabaseError, Conflict, RequestTimeout
    pagination.ts    # Page, PageRequest
    layers.ts        # CoreLayer (Node): config + stdout logger + platform services
    http/            # runtime.ts (HttpRuntime, HttpServices), handler.ts (defineHandler, definePagedHandler, defineMessageHandler), router.ts (defineRouteGroup), responder.ts (runEffect), envelope.ts, pagination.ts, decode.ts, errors.ts (renderHTTPError), request_context.ts, inflight.ts
  observer/          # flush.ts (budget for one log write), trace_id.ts (trc_ ids), logger.ts (batched stdout for Node, console for Workers), log_file.ts (rotating JSON-lines file sink), log_json.ts (fixed-order JSON formatter), telemetry.ts (OTLP traces/metrics/log sink, Flusher), error_reporter.ts, metrics.ts, metrics_handler.ts (/metrics), http_observer.ts
  command/           # effect/cli commands (cli.ts + one file per command + helper.ts)
  routes/            # route.ts: the route table (root, /api, /.well-known, catch-all; registration order)
  middleware/        # cors, request_id, security_headers, load_shedding, body_limit, cache_control, rate_limit (+ rate_limit_shared: Redis-backed check, rate_limit_binding: Workers binding check)
  modules/           # one vertical slice per resource
    user/            # user_schema, user_repo, user_service, user_handler, user_routes (+ tests)
    health/          # health_handler
  database/
    service.ts       # DatabaseService contract, makeDatabaseService, makeQueryLogger, isUniqueViolation
    schema.ts        # Database (tables merged in by each module's schema)
    sqlite.ts        # SqliteDatabaseLayer (node:sqlite) — Node only
    d1.ts            # D1Binding, D1DatabaseLayer (portable), D1BindingNodeLayer (wrangler platform proxy; Node, local only, loaded lazily)
    layer.ts         # DatabaseLayer: picks the driver from DATABASE_DRIVER — Node only
    dialect/         # NodeSQLiteDialect (+ connection, driver, migration-aware adapter) and D1Dialect (+ connection, driver)
    migrator.ts      # Migrator wiring: getMigrationInfos, migrateToLatest, migrateTo, migrateDown
    migrations/      # index.ts static registry + one file per migration
    seeder.ts        # named seeder registry + runSeeders
    seeders/         # one file per seeder (idempotent)
app/                 # the frontend: pages/ (one .marko per page), tags/ (components, auto-discovered as <name>), styles/ (vanilla-extract *.css.ts: theme tokens + styles), marko.d.ts (ambient `*.marko` module for tsc)
builder/             # wraps Vite for what it does not do: cli.ts (build|compile), build.ts (runBuild), vite_build.ts (createBuilder wrapper), vite.ts (shared plugins, output dirs), postprocess.ts (obfuscation), compiler.ts (SEA), dev.ts (the `pnpm dev` launcher), config.ts / builder.config.ts
vite.config.ts       # Node target: SSR entry src/main.ts → dist/server/index.mjs, browser assets → dist/server/public
vite.worker.config.ts # Workers target: Cloudflare Vite plugin, SSR environment → dist/worker, browser assets → dist/worker/public
bin/edgy.mjs         # published bin shim
wrangler.jsonc       # Workers target: main src/worker.ts, D1 binding, vars
tests/               # shared test helpers: app.ts (makeTestApp), d1.ts (fakeD1), collector.ts (in-process OTLP receiver), cache.ts (fake shared cache store), ids.ts (user-id fixtures); the tests themselves sit beside the code
compose.yaml         # dev services: ClickStack (HyperDX + collector), its init, Valkey; data in ./.storage
vitest.config.ts     # test include pattern (src/** and tests/**) and the Marko + vanilla-extract plugins
.env.example         # generated by `pnpm app config:generate`; never edit by hand
docs/                # human-facing docs
```

## Commands

- `pnpm app <command> [flags]` — run the CLI from source (`node ./src/main.ts`)
- `pnpm typecheck` — `tsc -b --noEmit && mtc` (`tsc` skips `.marko` files and exits 0 on a broken template; `mtc` checks them)
- `pnpm check` — `oxfmt --check && oxlint`
- `pnpm format` — `oxfmt --write .`
- `pnpm dev` (= `pnpm watch:node`) — `node --watch-path=./src ./builder/dev.ts serve`: the launcher starts Vite in middleware mode and loads `src/main.ts` through its module runner; a page or style edit is a hot update, server code restarts the process. `serve` needs this or a build (a template cannot be imported by plain Node); the other CLI commands still run natively (`pnpm app …`)
- `pnpm build:node` / `pnpm build:worker` — `vite build --app` through `builder/cli.ts build --target=…` (server first, then the browser assets), followed by obfuscation, `chmod 755` and `package.json` for Node: `dist/server` (`index.mjs` + `public/`) / `dist/worker` (`index.js`, `wrangler.json`, `public/`); builder flags append (`pnpm build:node --minify`). There is no plain `pnpm build`
- `pnpm compile` — single executable (SEA), Node target only; builds the application again as one CJS file and embeds the browser assets as `public/<path>` blobs
- `pnpm watch:worker` — `vite --config vite.worker.config.ts`: the Worker in workerd (Cloudflare Vite plugin) with a local D1 under `.wrangler/`, `DATABASE_AUTO_MIGRATE` switched on; local overrides come from `.dev.vars`, never `.env.local`
- `pnpm preview` — `build:worker --minify --local` (sets `EDGY_LOCAL=1`, which switches migration on in the artifact), then `vite preview --config vite.worker.config.ts`: the built artifact, in workerd
- `pnpm run deploy` (not `pnpm deploy`: pnpm's own `deploy` command takes the bare name) — builds the Worker with `--minify`, then `wrangler deploy`, which follows the `.wrangler/deploy/config.json` redirect the plugin writes to `dist/worker/wrangler.json`
- `pnpm app config:generate [--check]` — regenerate or verify `.env.example`
- `pnpm check` is read-only; `pnpm lint` runs `oxlint --fix` and rewrites files
- `pnpm compose:up` / `compose:down` / `compose:restart` / `compose:cleanup` — the development services in `compose.yaml` (cleanup also deletes `./.storage`)
- `pnpm test` / `pnpm test:watch` — Vitest (`vitest run`, with `@effect/vitest`); tests live beside the code as `*.test.ts` and call the real app in-process. Beyond it, validate the Node bundle with `pnpm build:node` + `node dist/server/index.mjs serve --auto-migrate`, and the Worker with `pnpm preview`

## Conventions

- **TypeScript strict**, `.ts` extension on relative imports (Node type stripping)
- Handler programs are `Effect<A, AppError, HttpEnv>`; handlers stay thin and are declared with `defineHandler` (`src/kernel/http/handler.ts`), which delegates to `runEffect`
- DI by `Context.Service` with a `static layer` on the class; layers are composed in `src/kernel/layers.ts` (`CoreLayer`, once in `main.ts`) and `src/layers.ts` (`AppLayer`, per command). There is no global runtime
- Service methods use `Effect.fn('Service.method')` so every call gets a span
- `Effect.provide(layer)` appears only at the entry point (`src/main.ts`, lint rule `effecttsgo/strict-effect-provide`); per-command layers go through `Command.provide`. Argument checks use `ensure` (`src/command/helper.ts`), not a bare `return` next to `return yield*`
- Route groups are h3 plugins (`defineRouteGroup`); global middleware runs in registration order (`src/app.ts`: devAssets (`pnpm dev` only) → provideRuntime → cors → requestId → securityHeaders → httpObserver → loadShedding → bodyLimit) and is registered before groups mount
- Comments carry a why/contract/trap, never restate the next line
- Prose: `.llms/` is for agents (technical, file:line evidence); `docs/` is for humans (no internals, no paths); tree documents are English, no hard wrapping
