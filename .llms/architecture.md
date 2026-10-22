# Architecture

## Runtime composition

The application is a modular monolith. `CoreLayer` provides Node platform services, configuration, logging, and telemetry. `ApplicationLayer` composes the user and health services over the database layer. The serve command provides that graph around both startup migrations and the HTTP server, so migrations, user queries, and readiness checks share one database service and scope.

The Vite API adapter builds `ApplicationLayer` into a `ManagedRuntime` and gives its service context to the web handler. Solid's production renderer carries the already-built `UserService` through Node's async context while rendering; the development renderer uses the managed runtime bridge. The runtime is disposed when the Vite API handler closes.

## Feature and persistence boundaries

`modules/user/user_service.ts` defines application operations and depends on the `UserRepository` service contract in `modules/user/user_repo.ts`. `database/repositories/user_repository.ts` implements that contract with Kysely. Persistence failures cross the port as `UserRepositoryError`; HTTP handlers translate those failures to a sanitized `503` response.

`modules/health/health_service.ts` exposes the readiness check to the health route. The database ping is used as the readiness signal; no separate liveness route is implemented.

## Persistence

Kysely runs over SQLite through Node's built-in `node:sqlite` adapter. `DatabaseLayer` acquires the Kysely instance and destroys it when its Effect scope closes. Migrations and seeders use the same database service from CLI commands.

## Operational limits

The user lookup cache and rate limiter are process-local. A multi-instance deployment does not share either state. The configured database driver currently permits SQLite only; PostgreSQL helper functions do not imply a PostgreSQL adapter is implemented.
