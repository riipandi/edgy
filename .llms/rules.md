# Contracts and change rules

## Contracts

- `ApplicationLayer` in `src/kernel/layers.ts` is the composition point for application services; it builds the user service over one `DatabaseLayer` instance per layer scope.
- `serve --auto-migrate` applies migrations and then serves requests with the same scoped `Database` service, including when `DATABASE_PATH=:memory:`.
- Feature services depend on repository interfaces. Repository implementations belong in their feature module and use the database service; keep Kysely query construction out of HTTP handlers and application services.
- A feature's Effect entity schema defines its row type and Kysely table type; it augments `src/database/schema.ts`'s `Database` interface instead of registering tables centrally.
- Every server response carries the hardening headers from `src/middleware/security-headers.ts` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). The CSP allows inline styles only; a change that needs inline scripts must revisit the policy, not drop it. Page responses are the exception: the SSR bundle emits inline hydration scripts, so `renderPage` mints a per-request TypeID nonce (`nonce_…`), passes it to the Solid bundle's `handleRequest`, and sends `script-src 'self' 'nonce-…' 'strict-dynamic'` on that response alone — the global middleware skips responses that already carry a CSP. Fonts are self-hosted (fontsource variable packages imported through `src/assets/fontface.css`); the CSP admits no third-party origins.
- CORS is global middleware (`src/middleware/cors.ts`) built on Effect's `HttpMiddleware.cors`: `CORS_ENABLED` (default on) gates it and `CORS_ALLOWED_ORIGINS` (comma-separated absolute origins, default empty) narrows it — an empty list echoes any caller origin because `credentials: true` forbids the literal `*`. It is registered as a global middleware (an `Effect.map(AppConfig, …)` fn, the `trustProxy` pattern), not a `Layer.unwrap` returning `middleware(...).layer` — the global form's `.layer` is `undefined` and a global layer inside `Layer.unwrap` crashes the router build.
- Metric labels are bounded: the request method collapses to the known set (others recorded as `OTHER`) and the status to its class, so series count stays flat.
- `/api/health` is a readiness probe: it returns `200` when the database ping succeeds and `503` when it fails. It is not a process liveness probe. The healthcheck CLI runs the same ping with a 2-second timeout.
- The serve command owns the shutdown sequence: it waits for `SIGINT`/`SIGTERM` itself (`src/kernel/graceful.ts`) and completes the server scope **normally**, because Effect's interrupt detaches async finalizers — a scope closed by interruption abandons them, so `runMain`'s signal handling is not used for the server path. The signal logs `shutting down (received <signal>)`, the HTTP server drains (up to its 20-second graceful-shutdown timeout; idle keep-alive sockets are dropped first), the database and Redis connections close with their own log lines, and the handler logs `application terminated` last; the process exits `0` and a second signal falls back to Node's force-exit.
- User repository failures return a sanitized `503` response. The underlying database cause must not be included in the HTTP body.
- The API wire contract is defined once in Effect HttpApi: endpoint schemas live in the feature module's group contract (`src/modules/<name>/module.ts`), handler factories receive the composed `HttpApi`, and every failure a handler can produce must be declared in the endpoint's `error` set — an undeclared failure becomes a 500 defect. Path-params validation belongs in the endpoint's `params` schema (a decode failure is an automatic 400).
- `/api-docs` (Scalar reference) and `/api/openapi.json` exist only when `API_DOCS_ENABLED=true`; the paths are constants in `src/kernel/http/api.ts`.
- API routes are rate-limited through the configured store (`RATE_LIMIT_STORE`): fixed-window counters in the database, or shared counters in Redis. The process-local memory mode no longer exists.
- Database and runtime resources must be closed with Effect scopes or `ManagedRuntime.dispose()`.

## How to change it

- Add application behavior to a feature service, expose required operations through its repository interface, and implement persistence in the feature module using the database adapter service.
- Add a feature endpoint by declaring it in the module's `HttpApiGroup` contract, implementing the handler in that module's factory (`<name>Handlers(api)`), then adding the group to `HttpApi.make(...).add(...)` in `src/kernel/http/api.ts` and providing the factory layer to `apiRoutes`. Add the matching behavior to `docs/api-endpoint.md` in the same change.
- Replace external dependencies in tests with service layers; use `TestClock` for time-dependent behavior.
- Keep expected failures in Effect error channels and map them at the HTTP boundary. Do not retry writes unless they are proven idempotent.

## Traps

- The Vite development API handler and production HTTP server have different composition entry points; keep both covered when changing application services.
- `ManagedRuntime` is used to bridge Solid's server renderer to Effect services in development. Production SSR receives the request's `UserService` through the renderer's async context and must not create a second database runtime per request.
- Configuration and endpoint documentation can drift; verify each documented surface against the route layers and configuration definitions.
- Migration and seeding helpers live in the Effect error channel (`src/database/migrator.ts`): they require the `Database` service, so a fresh database must be migrated before first use — a `rate_limits`-backed limiter fails the request (500) when the table is absent.
- In test compositions that wrap `apiRoutes` with `HttpRouter.provideRequest`, the request-provided context does not override layer-level services: fakes for `Database` must be provided at the layer level, after the rate-limit counter layer, or the tag is not found / the real service wins.
