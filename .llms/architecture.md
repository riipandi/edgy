# Architecture

## Runtime composition

The application is a modular monolith. `CoreLayer` provides Node platform services, configuration, logging, and telemetry. `ApplicationLayer` composes the user services over the database layer. The serve command provides that graph around both startup migrations and the HTTP server, so migrations, user queries, and readiness checks share one database service and scope.

The Vite API adapter builds `ApplicationLayer` into a `ManagedRuntime` and gives its service context to the web handler. Solid's production renderer carries the already-built `UserService` through Node's async context while rendering; the development renderer uses the managed runtime bridge. The runtime is disposed when the Vite API handler closes.

## Feature and persistence boundaries

`modules/user/user_service.ts` defines application operations and depends on the `UserRepository` service contract in `modules/user/user_repo.ts`, which also implements that contract using the `Database` service provided by the database adapter. The feature owns persistence behavior while the adapter owns the database connection and lifecycle. Persistence failures cross the port as `UserRepositoryError`; HTTP handlers translate those failures to a sanitized `503` response.

The API wire contract is owned by Effect HttpApi: the group contracts (`modules/health/module.ts`, `modules/user/module.ts`) define endpoint schemas, statuses, and error sets once, the handler factories in the same files implement them, and `kernel/http/api.ts` composes `HttpApi.make(...).prefix('/api')` into `HttpApiBuilder.layer`. The rate-limit middleware stays a router-level layer provided into that composition. The OpenAPI document and the Scalar reference mount from the same contract behind `API_DOCS_ENABLED`; the document title and version come from `package.json` through the `OpenApi.Title`/`OpenApi.Version` annotations. `kernel/http/api.ts` exports the path constants (`apiDocsPath`, `openApiPath`) that the Vite dev plugin's forwarding guard also reads.

`modules/health/module.ts` serves the readiness check directly from `Database.ping` — the health feature has no service of its own; the healthcheck CLI pings the same signal with a 2-second timeout. The same `HealthApi` group carries the liveness probe `GET /api/live`, which answers `200 { status: 'ok' }` without a `Database` dependency, so the supervisor's restart check and the load balancer's readiness check read different endpoints.

## Persistence

Kysely runs over SQLite through Node's built-in `node:sqlite` adapter. `database/schema.ts` exports an empty `Database` interface that feature schemas augment with their table types. The user feature derives its Kysely row type from its Effect entity schema in `modules/user/user_schema.ts`. `DatabaseLayer` acquires the Kysely instance and destroys it when its Effect scope closes. Migrations and seeders run through the same database service: `database/migrator.ts` wraps the Kysely `Migrator` (static in-bundle migration registry, `app_migration` tables) so every migration method is an Effect requiring `Database` and failing with `DatabaseError` — Kysely's resolve-with-`.error` convention is folded into the error channel at the boundary.

## Operational limits

Each feature declares its lookup cache as a `Cacheable.Class` service tag (schemas for serialization, the repository lookup, and a layer that resolves the cache configuration). The cache defaults to process memory; `REDIS_ENABLE=true` shares entries through Redis (`PersistedCache` over the compose Redis) and degrades to direct lookups when the backend is unreachable. A failed lookup is never pinned: the entry is invalidated so the next request retries. `CacheableService.get` pairs the value with a `CacheStatus` (`hit` | `miss` | `bypass` | `disabled`) — hit detection peeks the in-memory layer without populating; `bypass` skips read and fill. HTTP surfaces expose the status in the `x-cache` response header (the users API via a `WithHeaders` success schema, the SSR user page via `httpHeader` before the shell flush), and `?nocache=1` on either surface requests the bypass. Rate-limit windows live in the configured store: fixed-window counters in the database, or shared counters in Redis (`REDIS_ENABLE=true` over the compose Redis). The configured database driver currently permits SQLite only; PostgreSQL helper functions do not imply a PostgreSQL adapter is implemented.

## Observability decisions (plan-20261024_0105, 2026-10-24)

The six findings of issue-20261023_2135 were closed under the plan's seven decisions, recorded here
because each one shapes a contract another change can break:

- **D1 — scope is O1–O6; O7 stays parked** with its `considering` status and its trigger; the
  capacity tile is what detects when that trigger fires.
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
