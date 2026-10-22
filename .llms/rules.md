# Contracts and change rules

## Contracts

- `ApplicationLayer` in `src/kernel/layers.ts` is the composition point for application services; it builds the user service over one `DatabaseLayer` instance per layer scope.
- `serve --auto-migrate` applies migrations and then serves requests with the same scoped `Database` service, including when `DATABASE_PATH=:memory:`.
- Feature services depend on repository interfaces. Repository implementations belong in their feature module and use the database service; keep Kysely query construction out of HTTP handlers and application services.
- A feature's Effect entity schema defines its row type and Kysely table type; it augments `src/database/schema.ts`'s `Database` interface instead of registering tables centrally.
- `/api/health` is a readiness probe: it returns `200` when the database ping succeeds and `503` when it fails. It is not a process liveness probe.
- User repository failures return a sanitized `503` response. The underlying database cause must not be included in the HTTP body.
- API routes are rate-limited through the configured store (`RATE_LIMIT_STORE`): fixed-window counters in the database, or shared counters in Redis. The process-local memory mode no longer exists.
- Database and runtime resources must be closed with Effect scopes or `ManagedRuntime.dispose()`.

## How to change it

- Add application behavior to a feature service, expose required operations through its repository interface, and implement persistence in the feature module using the database adapter service.
- Add a route by composing it in `src/kernel/http/api.ts`; add the matching behavior to `docs/api-endpoint.md` in the same change.
- Replace external dependencies in tests with service layers; use `TestClock` for time-dependent behavior.
- Keep expected failures in Effect error channels and map them at the HTTP boundary. Do not retry writes unless they are proven idempotent.

## Traps

- The Vite development API handler and production HTTP server have different composition entry points; keep both covered when changing application services.
- `ManagedRuntime` is used to bridge Solid's server renderer to Effect services in development. Production SSR receives the request's `UserService` through the renderer's async context and must not create a second database runtime per request.
- Configuration and endpoint documentation can drift; verify each documented surface against the route layers and configuration definitions.
