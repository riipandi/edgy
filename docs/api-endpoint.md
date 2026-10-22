# API Endpoints

| Method | Path             | Behavior                                               |
| ------ | ---------------- | ------------------------------------------------------ |
| `GET`  | `/api/health`    | Checks whether the database answers a readiness query. |
| `GET`  | `/api/users`     | Returns the user records as a JSON array.              |
| `GET`  | `/api/users/:id` | Returns one user, or a `400` or `404` response.        |

## Readiness

`/api/health` returns `200` with `{"status":"ok"}` when the database responds. It returns `503` with `{"status":"unavailable"}` when the database probe fails. This endpoint measures readiness; it does not report whether the process itself is alive.

## Users

`GET /api/users` returns the records stored in the database. `GET /api/users/:id` accepts a TypeID with the `user_` prefix. An invalid ID returns `400`; a valid ID that does not match a record returns `404`.

If a user lookup fails because of a database error, the endpoint returns `503` with `{"message":"Service unavailable"}`. The response does not include the database error cause.

## Rate limits and request IDs

API routes use the configured rate limit. A rejected request returns `429` with `Retry-After` and `RateLimit-*` headers. The counter is held in process memory, so separate server instances do not share it.

The server adds an `X-Request-ID` response header. A valid incoming `x-request-id` is reused; otherwise the server creates a request ID. Request logs include that ID.
