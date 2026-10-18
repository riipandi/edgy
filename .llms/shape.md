# Repository shape

The layout, the toolchain, and the commands. Read once; return when a path or a command is needed.

## Stack

- Node.js >= 24.22 (native TypeScript stripping: source runs directly, no build step in development), pnpm 12 (`devEngines`; `npx` rejected)
- Effect v4 (typed errors, DI layers, CLI, Config, Logger, Schema, Cache, Metric), h3 v2 (plugins, rou3 trie)
- Kysely 0.29 on `node:sqlite` (no native addons) or Cloudflare D1 (`DATABASE_DRIVER`)
- Pages: Solid 2 (`solid-js` + `@solidjs/router` file-based routes over `src/pages/`) and Panda CSS (`css()` in `src/styles/`, one generated stylesheet), server-rendered and streamed through `renderToStream`, hydrated by `src/pages/entry.tsx`
- Vite 8 (Rolldown) for every bundle; wrangler through the Cloudflare Vite plugin for Workers
- oxfmt + oxlint; `tsc -b --noEmit` (Solid JSX through `tsconfig.json`) for types; Vitest for unit and component tests; Playwright Test for browser tests

## Layout

```text
src/
  main.ts            # Node CLI entry; the only Effect.provide
  worker.ts          # Workers entry: one app per env object, exports only its handler
  app.ts             # createApp({ runtime, config }): global plugins + route table
  server.ts          # serveHttp: captures the HttpRuntime, starts h3 inside a scope
  node.ts            # makeNodeApp: runtime, rate limiter and createApp as Node builds them (serveHttp and dev.ts)
  dev.ts             # startDevApp: the application for `pnpm dev`, loaded through Vite's module runner
  layers.ts          # AppLayer (Node): configured database + services
  services.ts        # ServicesLayer: every module's repos and services (portable)
  kernel/            # runtime-agnostic core
    config/          # service.ts (ConfigService, appConfig), field.ts (field helpers), one section file each (server, database, logging, security, observability, cors), example.ts (.env.example)
    cache/           # read_through.ts, guard.ts (fail-open decorator), local.ts, edge_cache.ts (Workers Cache API)
    http/            # the h3 <-> Effect bridge: handler.ts + handler_doc.ts (defineHandler, definePagedHandler, defineMessageHandler), router.ts (defineRouteGroup, routesOf, API_PREFIX), responder.ts (runProgram, runEffect), runtime.ts (HttpRuntime, HttpServices), page.ts, html_response.ts (HTML CSP), error_page.ts, errors.ts, error_body.ts, envelope.ts, pagination.ts, decode.ts, openapi.ts + openapi_document.ts, allowed_methods.ts (405 Allow), assets.ts, node_assets.ts (Node only), proxy_protocol.ts (Node only), startup_failure.ts, request_context.ts, inflight.ts
    errors.ts, pagination.ts (Page, cursor codec), objectids.ts (defineId), redact.ts, ip.ts (addresses and CIDR ranges), fail_open.ts, layers.ts (CoreLayer, Node)
  observer/          # logger.ts, log_file.ts, log_json.ts, flush.ts, telemetry.ts (OTLP, Flusher), trace_id.ts, error_reporter.ts, metrics.ts, metrics_handler.ts, http_observer.ts, quiet_paths.ts
  middleware/        # cors, request_id, security_headers, development, load_shedding, body_limit, cache_control, client_ip, client_location, rate_limit (+ rate_limit_shared: Redis, rate_limit_binding: Workers)
  command/           # effect/cli: cli.ts, one file per command, helper.ts, generated.ts (shared by the generators)
  routes/            # the route table: route.ts (order matters), api.ts (/api group, apiModules), web.ts (pages), options.ts (rate-limit deps)
  modules/           # one vertical slice per resource: user/ (schema, repo, service, handler, routes), health/
  pages/             # origin-root page handlers, mounted by routes/web.ts: home.ts (GET /), user.ts (GET /users)
  database/
    service.ts       # DatabaseService, makeDatabaseService, makeQueryLogger, isUniqueViolation
    schema.ts        # the Kysely Database type
    sqlite.ts, d1.ts # the drivers (d1.ts is portable); d1_node.ts and wrangler_config.ts (Node only: local and --remote D1)
    layer.ts         # DatabaseLayer / databaseLayer({ remote }): picks the driver; Node only
    dialect/         # NodeSQLiteDialect and D1Dialect
    migrator.ts, migrations/ (index.ts registry + one file each), seeder.ts, seeders/
src/pages/           # Solid: route modules (index.tsx = /, users.tsx = /users), app.tsx (shell + Router), app-shell.tsx (document), entry.tsx (hydration), user-list.tsx, router.ts (fs-routes manifest)
src/web/             # h3 page handlers over the pages (home.ts, user.ts) and their tests
src/styles/          # Panda CSS modules (components/, elements/, pages/)
src/assets/          # global.css: the cascade-layer order
src/rpc/             # the browser client for /rpc (client.ts)
builder/             # the Vite plugin: edgy.ts (the one plugin), platform.ts (platformOf, OUT_DIR, CLIENT_DIR, withDefaults), node.ts, dev.ts, output.ts, native.ts (native-addon guard), preview.ts, worker.ts, compile.ts (single executable)
e2e/                 # Playwright: screens/ (one *.spec.ts per page), fixtures/ (page objects), utils/ (helpers), test-data/ (JSON), config.ts (ENV)
tests/               # shared test helpers (app.ts, d1.ts, cache.ts, collector.ts, ids.ts) and cross-cutting tests (dev server, vite config, live sockets, native addons); other tests sit beside the code
docs/                # human-facing docs (openapi.json is generated)
vite.config.ts       # plain Vite config + `plugins: [edgy({ mode, command })]`; yours to extend
playwright.config.ts, vitest.config.ts, wrangler.jsonc, compose.yaml, bin/edgy.mjs
.env.example         # generated by `pnpm app config:generate`; never edit by hand
.github/workflows/ci.yml  # check, typecheck, test, browser tests, both generators' --check, both builds
```

Output: `dist/server` (`index.mjs`, `chunks/`, `assets/`, `package.json`), `dist/worker` (`index.js`, `wrangler.json`, `public/assets/`).

## Commands

- `pnpm app <command> [flags]`: the CLI from source (`node ./src/main.ts`; plain Node, no Vite). Commands: `serve`, `config:generate`, `openapi:generate`, `migrate:up|down|status|reset|seed`.
- `pnpm dev [--mode worker]`: `vite`. Node: the application runs inside the dev server, one process and port (`HOST`/`PORT`, default `127.0.0.1:3000`, `strictPort`), reading `.env`, `.env.local` and the mode's files; a page or style edit and a change under `src/` or to an env file reload the browser (the latter restarts the application in the process). Worker: workerd with a local D1 under `.wrangler/`; settings come from `wrangler.jsonc`, local overrides from `.dev.vars`, never `.env.local`. `pnpm dev` migrates by itself unless `DATABASE_AUTO_MIGRATE=false`.
- `pnpm build [--mode worker]`: `vite build` (server first, then the browser assets). `--minify` minifies the server.
- `pnpm preview [--mode worker]`: serves what `pnpm build` wrote (it does not build). Node starts the built server on a free port and proxies the preview address to it; Worker runs the build in workerd (`127.0.0.1:3000`).
- `pnpm start`: `node --env-file-if-exists=.env.local ./bin/edgy.mjs serve`, the built server.
- `pnpm compile`: the single executable (SEA); Node target, host platform only.
- `pnpm run deploy` (not `pnpm deploy`): builds the Worker with `--minify`, then `wrangler deploy` (which follows the redirect the plugin writes to `dist/worker/wrangler.json`).
- `pnpm app config:generate [--check]`, `pnpm app openapi:generate [--check]`: regenerate or verify `.env.example` and `docs/openapi.json`.
- `pnpm check` (`oxfmt --check && oxlint`, read-only), `pnpm format`, `pnpm lint` (`oxlint --fix`, rewrites files), `pnpm typecheck` (`tsc -b --noEmit`; Solid JSX comes from `tsconfig.json`: `jsxImportSource: "@solidjs/web"`).
- `pnpm test` / `pnpm test:coverage`: Vitest, project `unit` (`src/**` and `tests/**`, `*.test.ts`) and project `components` (`src/pages/**/*.test.tsx` in jsdom, `@solidjs/testing-library`), coverage by V8 over `src/` in `.output/tests-results/coverage` (`pnpm test:report` serves it). Beyond it, validate the Node bundle with `pnpm build` + `node dist/server/index.mjs serve --auto-migrate` and the Worker with `pnpm preview --mode worker`.
- `pnpm e2e` (`e2e:ui`, `e2e:chrome`, `e2e:firefox`, `e2e:safari`, `e2e:mobile`, `e2e:report`, `e2e:install`): Playwright Test (`playwright.config.ts`, `e2e/screens/*.spec.ts`). Four browser projects run against the production Node build, which `webServer` builds, migrates, seeds (a database under `.output/e2e/`) and starts on port 3100 (`E2E_BASE_URL` points at a running server instead; `ENV` in `e2e/config.ts`); a fifth, `Dev`, runs `hot-reload.spec.ts` against `pnpm dev` on 3101 (`E2E_DEV_URL`). Report: `.output/e2e-result/`.
- `pnpm compose:up|down|restart|cleanup`: the development services (cleanup also deletes `./.storage`).

## Conventions

- **TypeScript strict**, `.ts` extension on relative imports (Node type stripping).
- Handler programs are `Effect<A, AppError, HttpEnv>`, declared with `defineHandler` and kept thin.
- DI by `Context.Service` with a `static layer` on the class; `CoreLayer` once in `main.ts`, `AppLayer` per command; no global runtime. Service methods use `Effect.fn('Service.method')` so every call gets a span.
- `Effect.provide(layer)` appears only in `src/main.ts` (lint `effecttsgo/strict-effect-provide`); per-command layers go through `Command.provide`.
- Route groups are h3 plugins; global middleware runs in registration order (`src/app.ts`) and is registered before groups mount.
- Comments are short and only for a why, a contract or a trap; no history, no references to decisions, plans, issues or files (`rules.md`, "Code comments").
- Prose: `.llms/` is for agents (technical, file evidence); `docs/` is for humans (no internals, no paths); tree documents are English, no hard wrapping.
