# API Endpoints

| Method   | Path                | Behavior                                                  |
| -------- | ------------------- | --------------------------------------------------------- |
| `GET`    | `/api/health`       | Checks whether the database answers a readiness query.    |
| `GET`    | `/api/users`        | Returns a page of user records.                           |
| `GET`    | `/api/users/:id`    | Returns one user, or a `400` or `404` response.           |
| `POST`   | `/api/users`        | Creates a user; `201`, or `409` on a duplicate email.      |
| `PATCH`  | `/api/users/:id`    | Merges the patch into one user, or `404`.                  |
| `DELETE` | `/api/users/:id`    | Deletes one user; `200`, or `404` when unknown.            |
| `GET`    | `/api-docs`         | Scalar API reference (behind `API_DOCS_ENABLED`).          |
| `GET`    | `/api/openapi.json` | OpenAPI document for the API (behind `API_DOCS_ENABLED`).  |

Every row answers `HEAD` as well: the router falls back from `HEAD` to the `GET` route and returns the
same status and headers without a body.

## Response shape

Every `/api/*` response, success or error, is a JSON object with the same top-level shape. A
success response:

```json
{
  "status": "success",
  "data": { "...": "the endpoint's own payload, absent when there is nothing to return" },
  "metadata": {
    "status_code": 200,
    "request_id": "req_...",
    "trace_id": "...",
    "cache": "hit"
  }
}
```

An error response:

```json
{
  "status": "error",
  "message": "User not found",
  "error": {
    "code": "USER_NOT_FOUND",
    "retryable": false,
    "details": { "...": "present on some errors, e.g. which field failed validation" }
  },
  "metadata": { "status_code": 404, "request_id": "req_..." }
}
```

`metadata.request_id` and `metadata.trace_id` match the `x-request-id` response header and the
request's trace, for correlating a response with server logs. `metadata.cache` reports a user
lookup's cache status (`hit`, `miss`, `bypass`, or `disabled`) on `GET /api/users/:id`; add
`?nocache=1` to force `bypass` — the result is read from the database and the cached entry is
replaced. `error.retryable` tells a caller whether the same request may succeed unchanged if sent
again; `error.code` is a stable identifier safe to branch on, where `message` may change wording
over time.

`GET /api/health` keeps its own shape (`{"status":"ok"|"unhealthy","details":{...}}`, see
Readiness below) rather than this envelope — it answers machine health probes, not API calls.

## Pagination

`GET /api/users` accepts:

| Param        | Meaning                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `limit`      | Records per page, `1`-`100`. Defaults to `20`.                           |
| `cursor`     | Opaque token from a prior response's `metadata.next_cursor`.             |
| `sort_by`    | `id` (default) or `created_at`.                                          |
| `sort_order` | `asc` (default) or `desc`.                                               |

and returns pagination state in the same `metadata` object:

```json
{ "limit": 20, "has_more": true, "next_cursor": "eyJzb3J0VmFsdWUi..." }
```

`next_cursor` is `null` on the last page. Pass it back as `cursor` to fetch the next page with the
same `limit`, `sort_by`, and `sort_order` — a cursor is only valid for the sort it was issued
under. A cursor that cannot be read answers `400` with `error.code` `INVALID_CURSOR`.

## Readiness

`/api/health` runs the registered checks (the database ping) through the health core in
`src/kernel/healthcheck.ts` and aggregates them: all checks up answers `200` with
`{"status":"ok","details":{...}}`; any check down answers `503` with
`{"status":"unhealthy","details":{...}}`. Each entry in `details` carries the component's
`status` (`up`/`down`), a `timestamp`, and an `error` message when it is down; a check that
exceeds the shared 2-second probe budget reports as down with a timeout error. The healthcheck
CLI runs the same core and prints `Healthy`/`Unhealthy`, exiting `0`/`1`. Point the load
balancer's readiness check at the endpoint: it measures whether this instance can serve, not
whether the process is alive.

## Users

`GET /api/users` returns a page of the records stored in the database, newest-registered first by
default — see Pagination above. `GET /api/users/:id` accepts a TypeID with the `user_` prefix. An
invalid ID returns `400`; a valid ID that does not match a record returns `404` with `error.code`
`USER_NOT_FOUND`.

If a user lookup fails because of a database error, the endpoint returns `503` with `error.code`
`DATABASE_ERROR`. The response does not include the database error cause.

`POST /api/users` accepts `{ email, name?, avatar_url? }` and returns the created record with `201`;
the role starts at `10` (SUBSCRIBER) and the storage columns (`email_verified`, `disabled`, `data`,
timestamps) are server-owned. Requests are validated at the boundary: an email must look like an
address and stay within 254 characters, a name must not be blank and stays within 200 characters,
and an avatar URL must be an absolute `http(s)` URL within 2048 characters — a violation answers
`400` before any query runs. A duplicate email — on create or on `PATCH /api/users/:id` — returns
`409` with `error.code` `EMAIL_CONFLICT`; a user may keep their own email. `PATCH` accepts a
partial `{ email?, name?, avatar_url? }`: absent fields stay unchanged, an explicit `null` clears
the value, and the response carries the updated record. `DELETE /api/users/:id` removes the record
and answers `200` with an empty success envelope (no `data`); deleting an unknown id answers `404`.
Writes invalidate the user's cached read, so the next `GET /api/users/:id` reports `miss`.

## Error responses

Every error under `/api/*` is the error envelope above, `application/json` — nothing answers with
an empty body or plain text:

| Failure                             | Status | `error.code`         |
| ------------------------------------ | ------ | --------------------- |
| Validation or malformed payload      | `400`  | `VALIDATION_FAILED`    |
| Unknown path or unregistered method  | `404`  | `NOT_FOUND`            |
| Unknown user id                      | `404`  | `USER_NOT_FOUND`       |
| Conflicting value (duplicate email)  | `409`  | `EMAIL_CONFLICT`       |
| Invalid or expired pagination cursor | `400`  | `INVALID_CURSOR`       |
| Database or rate-limit store outage  | `503`  | `DATABASE_ERROR`       |
| Server defect                        | `500`  | `INTERNAL_ERROR`       |

A validation error's `error.details` names the failing part (`kind`) and carries the rendered
issue (for example `must be a valid email address\n at ["email"]`) — it names the failing field but
never carries internal causes. A request that falls outside `/api/*` keeps its page behavior — the
server-rendered application answers those paths, not the API.

## Rate limits and request IDs

The user routes use the configured rate limit. A rejected request returns `429` with `Retry-After`
and `RateLimit-*` headers, and the same information in `metadata.rate_limit`
(`{limit, remaining, reset}`, `reset` a Unix timestamp). A store that cannot be read returns `503`
rather than an unthrottled request. The fixed-window counter is stored in the `rate_limits`
database table, so separate server instances share the same limit.

`/api/health` is exempt from the rate limit: a readiness probe never consumes the budget, never
trips the limit, and keeps answering when the limiter's store is down.

## API documentation

Setting `API_DOCS_ENABLED=true` exposes `/api-docs` (the Scalar API reference) and `/api/openapi.json` (the OpenAPI document generated from the route contracts). Both are hidden when the flag is off, which is the default; production deployments should keep it off unless the API is meant to be public.
