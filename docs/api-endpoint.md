# API Endpoints

| Method   | Path                | Behavior                                                  |
| -------- | ------------------- | --------------------------------------------------------- |
| `GET`    | `/api/health`       | Checks whether the database answers a readiness query.    |
| `GET`    | `/api/users`        | Returns the user records as a JSON array.                 |
| `GET`    | `/api/users/:id`    | Returns one user, or a `400` or `404` response.           |
| `POST`   | `/api/users`        | Creates a user; `201`, or `409` on a duplicate email.     |
| `PATCH`  | `/api/users/:id`    | Merges the patch into one user, or `404`.                 |
| `DELETE` | `/api/users/:id`    | Deletes one user; `204`, or `404` when unknown.           |
| `GET`    | `/api-docs`         | Scalar API reference (behind `API_DOCS_ENABLED`).         |
| `GET`    | `/api/openapi.json` | OpenAPI document for the API (behind `API_DOCS_ENABLED`). |

Every row answers `HEAD` as well: the router falls back from `HEAD` to the `GET` route and returns the
same status and headers without a body.

## Response headers

`x-cache` reports the user lookup cache on `/api/users/:id` and on the SSR user page: `hit` when the
entry was served from the cache, `miss` when it was read from the database, and `bypass` when the
request skipped the cache. Add `?nocache=1` to any user read to force a `bypass` — the result is read
from the database and the cached entry is replaced.

## Readiness

`/api/health` returns `200` with `{"status":"ok"}` when the database responds. It returns `503` with `{"status":"unhealthy"}` when the database probe fails. Point the load balancer's readiness check at it: it measures whether this instance can serve, not whether the process is alive.

## Users

`GET /api/users` returns the records stored in the database. `GET /api/users/:id` accepts a TypeID with the `user_` prefix. An invalid ID returns `400`; a valid ID that does not match a record returns `404` with `{"_tag":"NotFound"}`.

If a user lookup fails because of a database error, the endpoint returns `503` with `{"_tag":"ServiceUnavailable"}`. The response does not include the database error cause.

`POST /api/users` accepts `{ email, name?, avatar_url? }` and returns the created record with `201`; the role starts at `10` (SUBSCRIBER) and the storage columns (`email_verified`, `disabled`, `data`, timestamps) are server-owned. Requests are validated at the boundary: an email must look like an address and stay within 254 characters, a name must not be blank and stays within 200 characters, and an avatar URL must be an absolute `http(s)` URL within 2048 characters — a violation answers `400` before any query runs. A duplicate email — on create or on `PATCH /api/users/:id` — returns `409` with `{"_tag":"Conflict"}`; a user may keep their own email. `PATCH` accepts a partial `{ email?, name?, avatar_url? }`: absent fields stay unchanged, an explicit `null` clears the value, and the response carries the updated record. `DELETE /api/users/:id` removes the record and answers `204`; deleting an unknown id answers `404`. Writes invalidate the user's cached read, so the next `GET /api/users/:id` reports `miss`.

## Rate limits and request IDs

API routes use the configured rate limit. A rejected request returns `429` with `Retry-After` and `RateLimit-*` headers. A store that cannot be read returns `503` rather than an unthrottled request. The fixed-window counter is stored in the `rate_limits` database table, so separate server instances share the same limit.

## API documentation

Setting `API_DOCS_ENABLED=true` exposes `/api-docs` (the Scalar API reference) and `/api/openapi.json` (the OpenAPI document generated from the route contracts). Both are hidden when the flag is off, which is the default; production deployments should keep it off unless the API is meant to be public.
