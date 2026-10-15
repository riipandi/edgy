# API Endpoint

| Method | Path                        | Description                                       |
| ------ | --------------------------- | ------------------------------------------------- |
| `GET`  | `/`                         | Liveness check, answers the plain text `All is well` |
| `GET`  | `/health`                   | Readiness check (database reachable); `503` while shutting down |
| `GET`  | `/metrics`                  | Prometheus metrics, only when `METRICS_ENABLED=true` |
| `GET`  | `/api/users`                | List users, paginated                             |
| `GET`  | `/api/users/:id`            | Fetch one user                                    |
| `POST` | `/api/users`                | Create a user from a JSON body (`201`)            |
| `GET`  | `/.well-known/security.txt` | Contact metadata (RFC 9116 style)                 |

Every endpoint under `/api`, and `/health`, answers in the envelope below. `/health` carries only a `message`, with no `data`. `/` and `/.well-known/*` do not.

## Response format

A successful response carries the payload in `data`, and always reports the HTTP status and the request ID:

```json
{
  "status": "success",
  "data": { "id": "user_01m5k7w3p8fvx9r2c4t6y0hq1d", "email": "ada@example.com", "name": "Ada Lovelace" },
  "metadata": { "status_code": 200, "request_id": "req_01m4zyktdnfzva2mkmb76p93hq" }
}
```

An error has a human-readable `message` and an `error` object a program can act on:

```json
{
  "status": "error",
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_FAILED",
    "retryable": false,
    "details": [{ "path": ["email"], "message": "must be a valid email address" }]
  },
  "metadata": { "status_code": 400, "request_id": "req_01m4zyktdzfzva2mn4svp2rqqm" }
}
```

| Field | Meaning |
| ----- | ------- |
| `error.code` | Stable name of the failure (`NOT_FOUND`, `RATE_LIMITED`, `DATABASE_ERROR`…). Switch on this, not on `message` |
| `error.retryable` | `true` when sending the same request again can succeed (a timeout, a busy database, a rate limit, an overload) |
| `error.details` | Facts about this failure: the validation issues, the id that was not found, `retry_after` seconds |
| `error.debug` | What lies behind a server-side failure. Only when the server runs at `LOG_LEVEL=Debug` or below; secrets in it are removed |

The same id is in the `X-Trace-ID` header, so a client or proxy that never parses the body can still log it.

`metadata.trace_id` is on error responses too, when traces are exported: quote it (with
`metadata.request_id`) when you report a problem. A field that holds a secret (`password`, `token`…)
is never quoted back in a validation message.

Responses contain only the documented fields.

## Pagination

List endpoints accept these query parameters:

| Parameter    | Default | Meaning                                                              |
| ------------ | ------- | -------------------------------------------------------------------- |
| `page`       | `1`     | Page number, starting at 1                                           |
| `limit`      | `20`    | Items per page, 1 to 100 (`/api/users` refuses `-1`, "every record") |
| `sort_by`    | `id`    | Field to sort by. `/api/users` accepts `id`, `email` and `name`      |
| `sort_order` | `asc`   | `asc` or `desc`                                                      |

A paginated response adds the position to `metadata` and navigation to `links`:

```json
{
  "status": "success",
  "data": [{ "id": "user_01m5k7w3p8fvx9r2c4t6y0hq1d", "email": "ada@example.com", "name": "Ada Lovelace" }],
  "metadata": {
    "status_code": 200,
    "request_id": "req_01m4zymemrfera61y7ekvtpz48",
    "page": 1,
    "limit": 2,
    "total_pages": 3,
    "total_items": 5,
    "first_item_index": 1,
    "last_item_index": 2
  },
  "links": {
    "self": "/api/users?limit=2",
    "first": "/api/users?limit=2&page=1",
    "prev": null,
    "next": "/api/users?limit=2&page=2",
    "last": "/api/users?limit=2&page=3"
  }
}
```

- Item indexes start at 1. A page past the end returns an empty `data` and `null` indexes.
- Links are relative and keep your other query parameters, such as `sort_by`.
- When you ask for every record, `limit` is `null`, there is one page, and `links` holds only `self`.

## Errors

| Status | Meaning |
| ------ | ------- |
| `400`  | Validation failed (body, path or query), or the body is not valid JSON |
| `404`  | Unknown path (`NOT_FOUND`), or unknown user (`NOT_FOUND`, `"details": { "id": "user_…" }`); an `:id` that is not a `user_` id is a `400` |
| `415`  | A request body that is not `application/json` |
| `429`  | Rate limit exceeded; `Retry-After` says how many seconds to wait |
| `409`  | The user already exists (duplicate email; `CONFLICT`) |
| `413`  | Request body larger than `BODY_LIMIT` |
| `499`  | The client closed the connection before the response |
| `500`  | Server-side failure (`DATABASE_ERROR`, `INTERNAL_ERROR`); the cause goes to the log, and to the response only in debug mode, redacted |
| `503`  | `/health` while the server is shutting down, or any `/api` request while the server is overloaded (`Retry-After: 1`) |
| `504`  | The request exceeded `REQUEST_TIMEOUT` |

## Tracing

When the server exports telemetry, a successful response carries `metadata.trace_id`, the id of its
trace in your observability backend, written as a `trc_` id. Send a W3C `traceparent` header to make
the server's spans part of your own trace; the same trace comes back.

The `trc_` id identifies the trace of your request on the server side: quote it when you report a
problem, and whoever runs the server can find everything that happened.

```json
"metadata": { "status_code": 200, "request_id": "req_01m5…", "trace_id": "trc_0ayxjhj5pd8fer8j7b44e80ccw" }
```

## Skipping the cache

A single user is served from a cache for up to `CACHE_TTL`. Add `?nocache=true` to a `GET` to read it
from the database for that request:

```bash
curl 'http://localhost:3000/api/users/user_01m5k7w3p8fvx9r2c4t6y0hq1d?nocache=true'
```

Only the value `true` counts. The request does not refresh the cache for anyone else.

## Rate limiting

When rate limiting is enabled (`RATE_LIMIT_ENABLED`), every `/api` response reports the caller's allowance, in headers and
in `metadata.rate_limit`:

```json
"rate_limit": { "limit": 100, "remaining": 97, "reset": 1792077446 }
```

The same numbers are in the `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`
headers. `reset` is a Unix timestamp. A refused request (`429`) carries them too, in the headers and in
the error body's `metadata.rate_limit`, plus `Retry-After` (seconds to wait).

On Cloudflare Workers with `RATE_LIMIT_STORE=cloudflare` the store only says allowed or refused, so
`remaining` (and `X-RateLimit-Remaining`) is left out; `limit` is the configured `RATE_LIMIT_MAX`.
Probes (`/health`, `/`) and `/.well-known` are never limited.

## Security headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer` and a `Content-Security-Policy` that forbids loading anything.

## Other response headers

| Header | When | Meaning |
| --- | --- | --- |
| `Cache-Control: no-store` | every `/api` response, errors included | Answers are per caller and per moment; nothing may cache them |
| `Server-Timing: total;dur=<ms>` | every response | Time the server spent on the request |
| `Link` | collections | The pagination links of the body (`self`, `first`, `prev`, `next`, `last`) as RFC 8288 relations |
| `X-Request-ID` | every response | The request's `req_` id; send your own to continue an upstream trace |
| `X-Trace-ID` | when the trace was recorded | The trace's `trc_` id (same as `metadata.trace_id`); absent when telemetry is off or the request was not sampled |
| `X-Cache` | a read served through the cache | `HIT` (from the cache), `MISS` (read from the database) or `BYPASS` (`?nocache=true`); absent otherwise. The same answer is in `metadata.cache` (`hit`, `miss`, `bypass`), errors included |
| `Retry-After` | `429`, `503` | Seconds to wait before trying again |

For a browser app on another origin, the `Access-Control-Expose-Headers` of every response lists
`X-Request-ID`, `X-Trace-ID`, `X-Cache`, the three `X-RateLimit-*` headers, `Retry-After` and `Link`, so a script can read them.

## Identifiers

Every id is a TypeID: a prefix that says what it is, then 26 characters. They sort by creation time.

| Prefix  | What                         | Where you see it |
| ------- | ---------------------------- | ---------------- |
| `req_`  | One request                  | `x-request-id`, `metadata.request_id`, every log line of the request |
| `trc_`  | One trace                    | `metadata.trace_id`, the `traceId` of request log lines |
| `user_` | A user                       | `data.id`, `/api/users/:id` |
| `inst_` | A running server instance    | `service.instance.id` in telemetry |

## Request ID

Every response carries an `x-request-id` header, repeated as `metadata.request_id`. Send your own to continue an upstream trace:

```bash
curl -H 'x-request-id: req_from_gateway' http://localhost:3000/api/users
```

> [!NOTE]
> Error responses include CORS headers too, so the request ID and CORS survive on `4xx` and `5xx` alike.
