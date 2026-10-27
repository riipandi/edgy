# Architecture

## Runtime composition

Edgy is designed as a modular monolith built on Effect v4. The system separates infrastructure concerns into a platform core layer and domain features into self-contained modules.

```mermaid
graph TD
    ConfigLayer["ConfigLayer (src/kernel/config/config.ts)"] --> CoreLayer["CoreLayer (src/kernel/layers.ts)"]
    
    subgraph Core ["Infrastructure Core"]
        CoreLayer --> Platform["NodeServices.layer (@effect/platform-node)"]
        CoreLayer --> Telemetry["TelemetryRuntimeLayer & RuntimeMetricsLayer (src/observer)"]
        CoreLayer --> Logger["LoggerLayer (src/observer/logger.ts)"]
    end

    subgraph Persistence ["Persistence Layer"]
        DBConfig["DatabaseConfig"] --> DBLayer["DatabaseLayer (src/database/adapter.ts)"]
        DBLayer --> TursoDialect["Turso Kysely Dialect (src/database/dialect.ts)"]
    end

    subgraph Modules ["Feature Modules"]
        Registry["kernel/registry.ts (moduleServiceLayer)"] --> IdentityModule["IdentityLayer (src/modules/identity/module.ts)"]
        IdentityModule --> UserLayer["UserLayer (src/modules/identity/user/user_layer.ts)"]
        UserLayer --> UserService["UserService"]
        UserLayer --> UserRepo["UserRepository (src/modules/identity/user/user_repo.ts)"]
        UserLayer --> UserCache["User Cache (Cacheable.Class)"]
    end

    DBLayer --> ApplicationLayer["ApplicationLayer (src/kernel/layers.ts)"]
    Registry --> ApplicationLayer
    CoreLayer --> ManagedRuntime["ManagedRuntime (src/kernel/runtime.ts)"]
    ApplicationLayer --> ManagedRuntime
```

`kernel/layers.ts` composes two primary layers:
- `CoreLayer` provides Node platform services, parsed configuration (`AppConfig`), structured logging (`LoggerLayer`), and OpenTelemetry tracing/metrics (`TelemetryRuntimeLayer`, `RuntimeMetricsLayer`).
- `ApplicationLayer` provides domain feature services by layering `moduleServiceLayer` over `DatabaseLayer`. The serve command wraps this layer around both automatic migrations and the HTTP server scope, allowing database connections to be shared safely.

`kernel/runtime.ts` manages a singleton `ManagedRuntime` constructed from `ApplicationLayer` and `CoreLayer`. It controls application lifecycle and disposal (`applicationContext()`, `disposeUserRuntime()`). Start server functions utilize this runtime and bridge request-scoped services via Node's `AsyncLocalStorage`.

## Module registry pattern

Feature modules are self-contained packages under `src/modules/<name>/`. Each module exports its domain routes, handlers, and service layer via a single `module.ts` barrel. `src/kernel/registry.ts` is the single integration file for the entire application:

```mermaid
graph LR
    subgraph Module ["src/modules/identity/module.ts"]
        UsersApi["UsersApi (HttpApiGroup)"]
        usersHandlers["usersHandlers (Handler Factory)"]
        identityLayer["identityLayer (Service Layer)"]
    end

    subgraph Registry ["src/kernel/registry.ts"]
        api["api = HttpApi.make().add(HealthApi, UsersApi)"]
        moduleHandlerLayer["moduleHandlerLayer = healthHandlers + usersHandlers"]
        moduleServiceLayer["moduleServiceLayer = identityLayer"]
    end

    UsersApi --> api
    usersHandlers --> moduleHandlerLayer
    identityLayer --> moduleServiceLayer
    
    api --> HttpBuilder["src/kernel/http/api.ts (HttpApiBuilder)"]
    moduleHandlerLayer --> HttpBuilder
    moduleServiceLayer --> AppLayer["src/kernel/layers.ts (ApplicationLayer)"]
```

`kernel/registry.ts` wires the application without touching the kernel core:
1. `api`: Builds the root `HttpApi` using `.add(HealthApi, UsersApi)` with title, version, and `/api` prefix.
2. `moduleServiceLayer`: Merges all feature service layers using `Layer.mergeAll(...)`. Consumed exclusively by `src/kernel/layers.ts`.
3. `moduleHandlerLayer`: Merges all feature handler factories for a given `HttpApi` instance. Consumed exclusively by `src/kernel/http/api.ts`.

## HTTP middleware and request lifecycle

The HTTP pipeline uses a strict middleware composition order defined centrally in `src/kernel/http/stack.ts`. This single definition prevents middleware drift between production serving and development forwarding.

```mermaid
sequenceDiagram
    autonumber
    actor Client as HTTP Client
    participant TP as TrustProxyMiddleware
    participant TR as RequestTracerMiddleware
    participant CORS as CorsMiddleware
    participant Routes as Routes (apiRoutes / SSR / Metrics)
    participant Rate as RateLimitMiddleware
    participant ReqId as RequestIdMiddleware
    participant Err as ErrorResponseMiddleware
    participant Log as RequestLogMiddleware
    participant Sec as SecurityHeadersMiddleware

    Client->>TP: Incoming HTTP Request
    TP->>TR: Resolve client IP from trusted proxies
    TR->>CORS: Start OpenTelemetry server span
    CORS->>Routes: Check CORS origin and headers
    Routes->>Rate: Intercept /api/* routes
    alt Rate Limit Exceeded
        Rate-->>Err: ApiRateLimitedError (429)
    else Under Limit
        Rate->>Routes: Execute Handler / DB Query
    end
    Routes-->>ReqId: Return HttpServerResponse / Error
    ReqId->>Err: Attach x-request-id (TypeID req_...)
    Err->>Log: Reshape unhandled defects into ErrorEnvelope
    Log->>Sec: Emit structured access log (skips quiet paths)
    Sec-->>Client: Apply CSP, X-Frame-Options, HSTS headers
```

1. `trustProxyMiddleware` (`src/middleware/trust-proxy.ts`): Evaluates `TRUST_PROXY` configuration to safely determine client IP from `X-Forwarded-For` or socket address.
2. `requestTracerMiddleware` (`src/middleware/tracer.ts`): Binds trace context and initiates an OpenTelemetry request span.
3. `corsMiddleware` (`src/middleware/cors.ts`): Emits CORS headers based on `CORS_ENABLED` and `CORS_ALLOWED_ORIGINS`.
4. Routes (`src/kernel/http/api.ts` & `src/kernel/renderer.ts`): Dispatches requests to API endpoints, metrics endpoint, or SSR page router. API routes are wrapped in `rateLimitMiddleware`.
5. `requestIdMiddleware` (`src/middleware/request-id.ts`): Generates a unique TypeID (`req_...`) for every request and sets `x-request-id`.
6. `errorResponseMiddleware` (`src/middleware/error-response.ts`): Intercepts all failures under `/api/*` and normalizes them into the standard `ErrorEnvelope`.
7. `requestLogMiddleware` (`src/middleware/request-log.ts`): The single access-log owner — one log line and one metric update per request, the cause carried on failures; quiet paths stay silent on success and log failures like any other path.
8. `securityHeadersMiddleware` (`src/middleware/security-headers.ts`): Adds standard security headers. SSR routes supply their own nonce-based CSP (`script-src 'self' 'nonce-...'`).

## Persistence boundary

Persistence utilizes Kysely over SQLite via a unified custom dialect in `src/database/dialect.ts`. The transport is determined strictly by `DATABASE_URL`:
- **Local File (`file:` URI or bare path)**: Uses `@tursodatabase/database` with `experimental: ['multiprocess_wal']`. Multi-process WAL allows concurrent read/write operations across OS processes on the same host (e.g., serve worker, migration CLI, healthcheck probe).
- **Remote Database (`libsql://`, `turso://`, `https://`, `http://`)**: Uses `@tursodatabase/serverless` over HTTP with mandatory `DATABASE_TOKEN`. Every query is bounded by a 5-second timeout, and connection acquisition issues a fast `SELECT 1` pre-flight check.
- **Transactions**: Single-stream execution guarantees connection isolation without custom locking. `insertId` is reported exclusively for `INSERT` statements across both engines.
- **Migrations**: `src/database/migrator.ts` encapsulates the Kysely `Migrator` in Effect's error channel, mapping failure details to `DatabaseError`.

## Cache and rate limiting

- **Cache Subsystem (`src/kernel/cache.ts`)**: Lookups use `Cacheable.Class`. By default, entries reside in a bounded in-memory LRU cache with concurrent lookup deduplication. Enabling `REDIS_ENABLE=true` switches to a shared Redis store (`PersistedCache`, Redis DB 1) with graceful fallback to un-cached database reads upon Redis disruption.
- **Rate Limiting (`src/middleware/rate-limit.ts`)**: Employs a token-bucket algorithm rather than a fixed window. Tokens refill continuously (`refillRateMillis = window / limit`). Counters persist to the `rate_limits` table in SQLite by default, or to Redis (DB 2) when enabled. A database or cache outage causes the rate limiter to fail closed with a `503 DATABASE_ERROR`.

## SSR and hydration architecture

- **Rendering pipeline**: The Effect listener forwards page requests to TanStack Start's `fetch` handler. In production `src/kernel/renderer.ts` imports the built server bundle and calls its default `fetch(request)`; in `vpr dev` Start's dev middleware renders pages inside Vite. Start owns the document shell, streaming, and hydration; the Effect server keeps `/api/*`, metrics, middleware, and static assets.
- **Dev page access log**: In dev the Effect stack never sees page traffic, so the Start-side `devAccessLog` middleware (`src/middleware/dev-access-log.ts`, registered first in `src/start.ts`) emits the same access record through the application runtime; it skips `/api/*`, `/metrics`, `/api-docs`, and the shared quiet list, and the DEV guard makes the production bundle pass through untouched.
- **Script Nonce Hardening**: `src/kernel/csp_nonce.ts` mints one TypeID nonce per process and shares it with the router factory (via `globalThis`) and the renderer; the router factory stamps it onto streamed scripts through `ssr.nonce`, and the renderer issues the CSP header (`script-src 'self' 'nonce-...' 'strict-dynamic'`).
- **Server functions**: Page data crosses the client boundary only through `createServerFn` (`src/modules/identity/user/user_fns.ts` wraps `user.server.ts`). Handlers resolve `UserService` through the request-scoped AsyncLocalStorage (`user_context.ts`) and read `nocache` from `getRequest()`. `/api/*` remains the public HTTP contract; a server function is an internal RPC endpoint, not an API.
- **Data cache**: TanStack Query owns page data. `src/provider.tsx` defines `GlobalContext` and `getContext()`; the `QueryClient` is created inside `getRouter()` (one per request — a module-level singleton leaks SSR data between requests) and reaches routes through the router context. `setupRouterSsrQueryIntegration` dehydrates on the server and hydrates on the client; the explicit `Wrap` provider runs with `wrapQueryClient: false` so the provider is not doubled.
- **The x-cache bridge**: `setResponseHeader` inside a server function does not reach the HTML response. The handler records the cache verdict on the request-scoped page meta (`src/kernel/page_meta.ts`), and the Start request middleware in `src/start.ts` copies it onto the outgoing HTML response.
- **Zero-Runtime CSS**: Page styles in `src/resources/styles/` are authored with StyleX and extracted to static CSS bundles at build time. `sx` (`src/resources/styles/props.ts`) maps style compositions to a `className` prop.
- **Route tree generation**: The Start plugin's router generator scans `src/routes` and writes the gitignored `src/routeTree.gen.ts` when its computed content changes. Both `router.routesDirectory` and `router.generatedRouteTree` are absolute `resolve()` paths — the generator resolves its values against `srcDirectory`, and relative strings once sent it to `src/src/`. A clean checkout has no declaration until `vp dev` or `vp build` runs, so CI builds before lint and typecheck. A second generator (`prebuild: tsr generate` with `@tanstack/router-cli`) existed briefly: npm pre-hooks never fire under `vpr build`, and the plugin already runs the same generator version, so the CLI was removed.

Decision record (2026-10-27, from `plans/plan-20261027_2042.md`): **request-log is the single access-log owner; quiet paths are silent on success and loud on failure; dev page traffic logs through the Start middleware.** The framework's built-in response record is disabled on `HttpRouter.serve` and the dev `toWebHandler` — it duplicated every access line, rendered failed responses as an empty-message record with a raw cause, and leaked causes on quiet paths; request-log now carries the cause itself and classifies `ClientAbort` interrupts out of the `500` metric bucket. Rejected: keeping the framework record (two records per request, two log shapes) and keeping only the framework record (loses the data-first format and the `requestId` annotation). Quiet-path failures log WARN with metrics — a failing request is signal regardless of its path; rejected: fully silent quiet paths. The `/.well-known/` quiet entry stays devtools-probe-only (the owner kept `jwks.json` and the other discovery documents logged — the earlier "deliberately broad" wording described a list entry that never existed). The stdout batched sink falls back to `stderr` instead of defecting. **The dev request-log loss was an early dispose, not a logger bug:** vite runs the value returned from `configureServer` as a post hook immediately after installing internal middlewares — the dev plugin used it as a shutdown hook, disposing the dev handler and the application runtime at startup, which killed every `Logger.batched` flush loop before the first request; the handler now lives for the dev session (evidence: `audit/audit-20261027_2042.md`).

Decision record (2026-10-27, from `archive/plan-20261027_1935.md`): **TanStack Query serves page data; the error surface is a generic boundary; the devtools are development-only.** Loaders run a static query (`staleTime: 'static'`) against `queryOptions` that wrap the server functions, and components read `useSuspenseQuery` — the loader prefetches before render so there is no loading flash, while the cache stays the freshness authority (this is why `defaultPreloadStaleTime: 0` from the previous plan matters). Rejected: `useSuspenseQuery`-only without loaders (loses prefetch-on-intent) and Query as a client-only cache beside the loader (two sources of truth). A missing user maps to `null` in the `queryFn` — a missing user is data, not an error — so the detail page keeps its inline not-found body and its 404 status. The root route became `createRootRouteWithContext` with `shellComponent` (Query forces the context type; the shell stays mounted across match transitions). The global `errorComponent` (`src/routes/-boundaries.tsx`) renders generic copy only — the `riipandi/tanstart` reference displays `error.message`, which would reintroduce the M4 leak, so that part of the reference is deliberately not copied. The devtools panel mirrors the reference (`@tanstack/react-devtools` with the Query and Router plugins plus `@tanstack/devtools-vite`) with two deviations: it renders only in development (the reference ships it unconditionally) and it receives the router's actual `QueryClient` through the root route context (the reference hands the panel a second client from a fresh `getContext()` call, which never sees any queries). `setResponseStatus` moved into `createIsomorphicFn().server()` in `src/kernel/ssr_status.ts` — the import-protection guard's compiler-safe boundary is what keeps the server import out of the client bundle without warnings.

Decision record (2026-10-27, from `archive/plan-20261027_1835.md`): **Page navigation is type-safe `<Link>`; the SSR configuration is verified against the documented behavior.** `src/paths.ts` and its string URLs are gone — navbar, users list, and home CTA render `<Link>` with typed `to`/`params`, so navigation is client-side and route renames fail typecheck instead of silently breaking URLs. Rejected: keeping the URL builder as a typed wrapper — it duplicates the router's generated types (no-shim rule). The router carries `defaultPreload: 'intent'` with `defaultPreloadStaleTime: 0` (the `riipandi/tanstart` reference's values): loaders warm on pointer or keyboard intent and the navigation still revalidates. The SSR surface was audited against the installed plugin schema and official docs: the option shape, `vite.installDevServerMiddleware`, `ssr.nonce`, the `createStart` request middleware, the dev split, and the dependency set are all correct; the router's server-side `origin` stays unset because probes showed Start emits relative URLs and a spoofed `Host` cannot inject an absolute redirect target.

Decision record (2026-10-27, from `archive/plan-20261027_0605.md`): **TanStack Start renders pages inside the Effect server; Effect remains the only listener.** Start owns the document shell, streaming, hydration, and the generated route tree; the Effect listener forwards page requests to Start's `fetch`. Rejected: the manual Router recipe with `entry-client`/`entry-server` — it adds a second server the listener would have to duplicate. Rejected: Nitro — it replaces the listener this repository's middleware stack is built around. **Page data moves to `createServerFn`; `/api/*` stays the public contract.** Loaders call server functions; handlers call `UserService` through the existing runtime. Rejected: keeping an `import.meta.env.SSR` branch in shared modules (preserves the old stack's shape), and SSR-side HTTP calls to `/api` (rendering would depend on the listener calling itself).

## Process lifecycle and graceful shutdown

- Positional CLI parsing in `src/command/root.ts` selects the execution runtime. The `serve` command bypasses `runMain` to ensure async finalizers run reliably during termination.
- `src/kernel/graceful.ts` registers signal handlers for `SIGINT` and `SIGTERM`. Shutdown proceeds in strict order:
  1. Stop accepting new HTTP connections and drain in-flight requests (20s timeout).
  2. Flush and close database connections (`Database connection closed`).
  3. Disconnect Redis stores and flush logs.
  4. Emit `Application terminated` and exit `0`. A second signal forces immediate exit with status `128 + signum`.
