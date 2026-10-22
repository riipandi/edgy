# API Endpoints

| Method | Path                 | Behavior                                                  |
| ------ | -------------------- | --------------------------------------------------------- |
| `GET`  | `/api/health`        | Checks whether the database answers a readiness query.    |
| `GET`  | `/api/users`         | Returns the user records as a JSON array.                 |
| `GET`  | `/api/users/:id`     | Returns one user, or a `400` or `404` response.           |
| `GET`  | `/docs`              | Swagger UI for the API (behind `API_DOCS_ENABLED`).       |
| `GET`  | `/docs/openapi.json` | OpenAPI document for the API (behind `API_DOCS_ENABLED`). |

## Readiness

`/api/health` returns `200` with `{"status":"ok"}` when the database responds. It returns `503` with `{"_tag":"ServiceUnavailable"}` when the database probe fails. This endpoint measures readiness; it does not report whether the process itself is alive.

## Users

`GET /api/users` returns the records stored in the database. `GET /api/users/:id` accepts a TypeID with the `user_` prefix. An invalid ID returns `400`; a valid ID that does not match a record returns `404` with `{"_tag":"NotFound"}`.

If a user lookup fails because of a database error, the endpoint returns `503` with `{"_tag":"ServiceUnavailable"}`. The response does not include the database error cause.

## Rate limits and request IDs

API routes use the configured rate limit. A rejected request returns `429` with `Retry-After` and `RateLimit-*` headers. The fixed-window counter is stored in the `rate_limits` database table, so separate server instances share the same limit.

## API documentation

Setting `API_DOCS_ENABLED=true` exposes `/docs` (Swagger UI) and `/docs/openapi.json` (the OpenAPI document generated from the route contracts). Both are hidden when the flag is off, which is the default; production deployments should keep it off unless the API is meant to be public.
