# Architecture

## Runtime composition

The application is a modular monolith. `CoreLayer` provides Node platform services, configuration, logging, and telemetry. `ApplicationLayer` composes the user services over the database layer. The serve command provides that graph around both startup migrations and the HTTP server, so migrations, user queries, and readiness checks share one database service and scope.

The Vite API adapter builds `ApplicationLayer` into a `ManagedRuntime` and gives its service context to the web handler. Solid's production renderer carries the already-built `UserService` through Node's async context while rendering; the development renderer uses the managed runtime bridge. The runtime is disposed when the Vite API handler closes.

## Feature and persistence boundaries

`modules/user/user_service.ts` defines application operations and depends on the `UserRepository` service contract in `modules/user/user_repo.ts`, which also implements that contract using the `Database` service provided by the database adapter. The feature owns persistence behavior while the adapter owns the database connection and lifecycle. Persistence failures cross the port as `UserRepositoryError`; HTTP handlers translate those failures to a sanitized `503` response.

The API wire contract is owned by Effect HttpApi: the group contracts (`modules/health/module.ts`, `modules/user/module.ts`) define endpoint schemas, statuses, and error sets once, the handler factories in the same files implement them, and `kernel/http/api.ts` composes `HttpApi.make(...).prefix('/api')` into `HttpApiBuilder.layer`. The rate-limit middleware stays a router-level layer provided into that composition. The OpenAPI document and the Scalar reference mount from the same contract behind `API_DOCS_ENABLED`; the document title and version come from `package.json` through the `OpenApi.Title`/`OpenApi.Version` annotations. `kernel/http/api.ts` exports the path constants (`apiDocsPath`, `openApiPath`) that the Vite dev plugin's forwarding guard also reads.

`modules/health/module.ts` serves the readiness check directly from `Database.ping` — the health feature has no service of its own; the healthcheck CLI pings the same signal with a 2-second timeout. The same `HealthApi` group carries the liveness probe `GET /api/live`, which answers `200 { status: 'ok' }` without a `Database` dependency, so the supervisor's restart check and the load balancer's readiness check read different endpoints.

## Persistence

Kysely runs over SQLite through a dialect in `database/dialect.ts` built on Turso's SDKs, not Node's `node:sqlite`. One URL resolves to one transport: a `file:` URI (or a bare path) opens the local engine from `@tursodatabase/database`, and `libsql://`/`turso://`/`https://`/`http://` opens a remote database through `@tursodatabase/serverless` over HTTP. `resolveDatabaseTarget` (`kernel/config/database.ts`) is the only place that decision is made, so an unknown scheme is an error rather than a silent local file. `database/schema.ts` exports an empty `Database` interface that feature schemas augment with their table types. The user feature derives its Kysely row type from its Effect entity schema in `modules/user/user_schema.ts`. `DatabaseLayer` acquires the Kysely instance and destroys it when its Effect scope closes. Migrations and seeders run through the same database service: `database/migrator.ts` wraps the Kysely `Migrator` (static in-bundle migration registry, `app_migration` tables) so every migration method is an Effect requiring `Database` and failing with `DatabaseError` — Kysely's resolve-with-`.error` convention is folded into the error channel at the boundary.

## Persistence decisions (plan-20261025_0055, 2026-10-25)

The `node:sqlite` driver left the tree; these decisions shape what replaced it, and each one is a
contract another change can break:

- **D1 — two transports, both Turso, never `@libsql/client`.** A single package cannot reach both a
  local file and a remote database: `@tursodatabase/database` is a native embedded engine that takes
  a path, `@tursodatabase/serverless` is pure JavaScript over `fetch` that takes a URL and a token.
  Both sit behind one Kysely dialect, so the feature code cannot tell which one it is talking to.
- **D2 — a local database is a `file:` URI.** `file:/path`, `file:///path` and
  `file://localhost/path` name this host, `file:./rel` is relative to the working directory, and the
  path is percent-decoded. `file://otherhost/path` and `file://path` are refused by name, because a
  local engine cannot open another machine's file and the scheme has no path in the second form. A
  bare path is accepted as a convenience; `:memory:` is refused, because the healthcheck probe and a
  migration run open the database from their own process and would each get a private one.
- **D3 — the dialect keeps `kysely-libsql`'s shape.** `SqliteAdapter`, `SqliteIntrospector`,
  `SqliteQueryCompiler` and a driver whose connection executes a compiled query, over a
  `TursoExecutor` (`execute`/`begin`/`commit`/`rollback`/`close`) that the two transports implement.
  The local executor awaits `prepare` and branches on `Statement.reader`; the remote one uses the
  compat client's `execute({ sql, args })`, which is libsql's own contract without the dependency.
  Remote rows arrive as arrays with non-enumerable named properties, so the executor maps each row
  through `result.columns` — reading them straight into JSON yields `[7,"seven"]`.
- **D4 — no custom lock.** `SqliteAdapter.supportsMultipleConnections = false` makes `RuntimeDriver`
  install a `ConnectionMutex`, and `Kysely.transaction` holds the one connection across the whole
  `BEGIN … COMMIT`. A statement issued during a transaction waits for it; verified by a concurrent
  read that waited out a 200 ms transaction and then saw the committed row.
- **D6 — the native binding stays outside the bundle.** The Turso JavaScript is inlined like any
  other dependency; only the compiled addon is `require`d at runtime from
  `node_modules/@tursodatabase/database-<platform>`, so `dist/` alone is no longer self-contained.
  The standalone build copies that package into `dist/node_modules` for the platform it built on
  (dereferenced out of pnpm's store, so a copied `dist/` does not depend on the store), which is
  also how the container image gets it: the Dockerfile copies `dist/` and nothing else. This
  retires the "single file, zero native dependencies" claim at a cost of roughly 16 MB of image. The leak guard needed no allowlist: its regex was matching import
  statements spelled inside JSDoc examples and template literals, which made a non-minified
  standalone build fail for reasons that had nothing to do with the new packages.
- **D13 — every local connection opens in multi-process WAL mode.** The engine takes an exclusive
  lock on the file for the connection's lifetime by default, which would have broken the container
  `HEALTHCHECK` and any `migrate:up` run while `serve` holds the database — `node:sqlite` never did
  that, so the swap would have been a silent operational regression. `LOCAL_CONNECT_OPTIONS` carries
  `experimental: ['multiprocess_wal']` and every process of this application passes it. Rejected:
  turning the container healthcheck into an HTTP probe, which weakens the documented readiness
  contract and still leaves migrations unusable during a server run.

## Operational limits

Each feature declares its lookup cache as a `Cacheable.Class` service tag (schemas for serialization, the repository lookup, and a layer that resolves the cache configuration). The cache defaults to process memory; `REDIS_ENABLE=true` shares entries through Redis (`PersistedCache` over the compose Redis) and degrades to direct lookups when the backend is unreachable. A failed lookup is never pinned: the entry is invalidated so the next request retries. `CacheableService.get` pairs the value with a `CacheStatus` (`hit` | `miss` | `bypass` | `disabled`) — hit detection peeks the in-memory layer without populating; `bypass` skips read and fill. HTTP surfaces expose the status in the `x-cache` response header (the users API via a `WithHeaders` success schema, the SSR user page via `httpHeader` before the shell flush), and `?nocache=1` on either surface requests the bypass. Rate-limit windows live in the configured store: fixed-window counters in the database, or shared counters in Redis (`REDIS_ENABLE=true` over the compose Redis). SQLite is the only engine: the local file and the remote Turso database are two transports of the same dialect, and no PostgreSQL adapter exists.

## Build and boot decisions (plan-20261024_0728, 2026-10-24)

The whole-system audit's fixes (audit-20261024_0636) landed under these decisions:

- **D1 — standalone inlining covers the built-in `ssr` environment.** The SolidStart plugin emits the
  SSR bundle from Vite's built-in `ssr` environment, which keeps Vite's default SSR externalization
  unless told otherwise; the standalone branch now spreads the same `resolve.noExternal` inlining it
  already gave the `effect` environment onto `ssr`. The build-time leak guard (static and dynamic
  bare-specifier scan over `dist/**/*.js`, run in the effect environment's `closeBundle` — the last
  to emit) turns a recurrence into a red build. The scan reads a statement only at a line start or
  after a `;` and requires `import`/`export` to be followed by whitespace, `{` or `*`, because the
  looser form matched import syntax spelled inside JSDoc examples and template literals — which made
  a non-minified build fail on comments. Specifiers not starting with a name character are still
  skipped: embedded string tables like `"import export from"` are not import statements.
- **D3 — Redis boot waits within a bounded window; the compose gate closes the cold start.** A
  shared `awaitRedis` helper (30 attempts, 1 s apart, warning per failed attempt) wraps both Redis
  layer builds; the app's compose dependency on redis is `service_healthy`. Lazy/degraded boot was
  rejected — it would silently switch the rate limiter to fail-closed-forever when Redis never
  comes up.
- **D4/D5 — the metrics sampler joins the `METRICS_ENABLED` gate; `APP_BASE_URL` rejects empty.**
  The sampler layer reads `AppConfig` (`Layer.unwrap`) and yields `Layer.empty` when the flag is
  off; the base-URL parser fails with the variable's config error on empty values, while the OS-env
  provider treats an empty environment variable as unset (the documented default applies).
- **F-06 (unauthenticated user emails) is parked, not fixed** — see the roadmap's parked unlocks.

## CLI decisions (plan-20261025_0002, 2026-10-25)

The CLI-conformance audit's ten findings (audit-20261024_2346) landed under these decisions:

- **D1 — the global flags stay the canonical `GlobalFlag` objects.** `Command.run` decides two things by
  object identity: whether the parsed `--log-level` becomes `References.MinimumLogLevel`
  (`cli/Command.ts`, `activeFlags.includes(GlobalFlag.LogLevel)`) and whether `--wizard` takes the
  wizard path (`flag === GlobalFlag.Wizard`). The previous code cloned every built-in through
  `Object.assign({}, builtIn, { flag: Flag.withHidden(...) })`, so the level was parsed and dropped and
  `--wizard` exited `0` doing nothing. `cli.ts` now provides `CliConfig.layer({ builtIns: [Help,
  Version, LogLevel] })` — no clone, no hiding — and `--wizard`/`--completions` disappear, which the
  document never named. Rebuilding the setting instead of cloning was rejected too: `GlobalFlag.Setting`
  mints a fresh service key per construction, so the level would be dropped again.
- **D2 — the level's value is normalized in argv.** `normalizeArgs` lowercases the token after
  `--log-level` (and the `--log-level=…` form) and the program runs through
  `Command.runWith(rootCmd, { version })(args)`; `LOG_LEVEL` already accepts the capitalized spelling,
  so the two entry points now agree. Rejected: a case-insensitive replacement flag — `Command.run` reads
  the level from `GlobalFlag.LogLevel.flag`, so the swap means mutating a library object.
- **D3 — `serve` is chosen by the first positional token.** `subcommandOf(args)` skips global flags and
  the value `--log-level` consumes, and `src/main.ts` branches on it. The previous `process.argv[2]`
  check meant `vpr app --log-level info serve` took the `runMain` path: exit `130`, no
  `shutting down (received SIGINT)`, no `application terminated`. Rejected: `argv.includes('serve')`
  (a flag value equal to `serve` would flip the process into server mode) and an env marker set by the
  handler (the branch has to be decided before the program runs).
- **D6 — the shutdown path owns the second signal and the Redis scopes.** `awaitShutdownSignal` keeps
  both listeners installed past the first signal and exits `128 + signum` on any later one, so
  `SIGINT` then `SIGTERM` no longer waits out the drain. Both Redis stores build their stack into a
  scope they own (`Scope.make` + `provideService`, closed from the finalizer between the two log lines)
  — `NodeRedis.layer` closes the client from its own scope finalizer, and finalizers run LIFO, so no
  consumer-side finalizer could ever run after the client's. The resource order across the shutdown is
  unchanged; only the `… closed` line is new.

## Observability decisions (plan-20261024_0105, 2026-10-24)

The six findings of issue-20261023_2135 were closed under the plan's seven decisions, recorded here
because each one shapes a contract another change can break:

- **D1 — scope was O1–O6; O7 followed on the owner's call (2026-10-24).** Retention is now the
  provisioner's reconciliation too: `CLICKSTACK_RETENTION_DAYS` (default 30, from compose) rewrites
  every `otel_*`/`hyperdx_*` table's TTL through the ClickHouse HTTP interface when it differs, so
  a restart heals both a changed setting and a table the image recreated. The capacity tile detects
  when the disk, not the retention, becomes the next thing to revisit.
- **D2 — O1 is the full compose path.** A compose `app` service builds the project Dockerfile
  (`debug-nonroot` distroless tag — the plain `nonroot` variant has no `/usr/bin/env`, so the entry
  shebang cannot exec), carries a 256m memory limit, publishes its port on `127.0.0.1`, and exports
  OTLP to the in-network collector; a privileged `cadvisor` service exposes container metrics that
  the collector scrapes into a `metrics/cadvisor` pipeline labelled `service.name=cadvisor`.
  Container tiles filter by the compose service label.
- **D3 — the alert channel is a generic webhook** behind `CLICKSTACK_ALERT_WEBHOOK_URL`; with the
  key unset the provisioner skips alerts entirely and no default channel is invented.
- **D4 — request metrics carry `{method, status_code, route}`.** `status_code` is the exact code,
  `route` is the template from the HttpApi contract (`/api` prefix baked into endpoint paths,
  bounded by the route table plus the `page`/`unmatched` literals); the class label was dropped,
  not kept beside it — the owner waived backward compatibility.
- **D5 — the liveness surface is `GET /api/live`** inside the existing `HealthApi` group, with no
  `Database` in the handler; readiness stays `/api/health`. See the contracts in rules.md.
- **D6 — dependency telemetry is one histogram plus bounded spans.** `dependency_duration_seconds
  {store, op}`; stores `{sqlite, postgres, redis}`; ops fixed to the six call shapes the adapters
  and middlewares make; the database-backed limiter consume span carries no metric because the
  adapter already times its own SQLite traffic.
- **D7 — the capacity projection is a read-only SQL tile** (`Days of headroom` divides
  `system.disks.free_space` by the `system.query_log.written_bytes` rate over a 7-day window); no
  new component owns capacity. The freshness/alerting shapes that rode phase 5 — fresh/stale/silent
  thresholds of 2 and 10 minutes, no-spans as two consecutive 5m windows because the v2 API has no
  10m interval — were verified against the running v2 API, which answers only inside the compose
  network.

The compose stack now runs seven services — `clickstack`, `clickstack-init`, `app`, `cadvisor`,
`redis-exporter`, `redis`, `mailpit` — and the provisioner reconciles connections, sources,
dashboards, and (behind the gate) alerts on every `compose up`.
