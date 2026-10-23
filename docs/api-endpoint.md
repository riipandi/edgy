# API Endpoints

| Method | Path                | Behavior                                                  |
| ------ | ------------------- | --------------------------------------------------------- |
| `GET`  | `/api/health`       | Checks whether the database answers a readiness query.    |
| `GET`  | `/api/live`         | Reports whether the process is alive; no database access. |
| `GET`  | `/api/users`        | Returns the user records as a JSON array.                 |
| `GET`  | `/api/users/:id`    | Returns one user, or a `400` or `404` response.           |
| `GET`  | `/api-docs`         | Scalar API reference (behind `API_DOCS_ENABLED`).         |
| `GET`  | `/api/openapi.json` | OpenAPI document for the API (behind `API_DOCS_ENABLED`). |

Every row answers `HEAD` as well: the router falls back from `HEAD` to the `GET` route and returns the
same status and headers without a body.

## Response headers

`x-cache` reports the user lookup cache on `/api/users/:id` and on the SSR user page: `hit` when the
entry was served from the cache, `miss` when it was read from the database, and `bypass` when the
request skipped the cache. Add `?nocache=1` to any user read to force a `bypass` — the result is read
from the database and the cached entry is replaced.

## Readiness and liveness

`/api/health` returns `200` with `{"status":"ok"}` when the database responds. It returns `503` with `{"_tag":"ServiceUnavailable"}` when the database probe fails. Point the load balancer's readiness check at it: it measures whether this instance can serve, not whether the process is alive.

`/api/live` returns `200` with `{"status":"ok"}` whenever the process answers requests. It never touches the database, so it stays green while the readiness probe fails — point a supervisor's liveness check at it so a database outage does not restart a working process.

## Users

`GET /api/users` returns the records stored in the database. `GET /api/users/:id` accepts a TypeID with the `user_` prefix. An invalid ID returns `400`; a valid ID that does not match a record returns `404` with `{"_tag":"NotFound"}`.

If a user lookup fails because of a database error, the endpoint returns `503` with `{"_tag":"ServiceUnavailable"}`. The response does not include the database error cause.

## Rate limits and request IDs

API routes use the configured rate limit. A rejected request returns `429` with `Retry-After` and `RateLimit-*` headers. A store that cannot be read returns `503` rather than an unthrottled request. The fixed-window counter is stored in the `rate_limits` database table, so separate server instances share the same limit.

## API documentation

Setting `API_DOCS_ENABLED=true` exposes `/api-docs` (the Scalar API reference) and `/api/openapi.json` (the OpenAPI document generated from the route contracts). Both are hidden when the flag is off, which is the default; production deployments should keep it off unless the API is meant to be public.
