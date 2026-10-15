# API Endpoint

| Method | Path                        | Description                                       |
| ------ | --------------------------- | ------------------------------------------------- |
| `GET`  | `/`                         | Liveness check, answers the plain text `All is well` |
| `GET`  | `/health`                   | Readiness check (database reachable)              |
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
  "data": { "id": 1, "email": "ada@example.com", "name": "Ada Lovelace" },
  "metadata": { "status_code": 200, "request_id": "req_01m4zyktdnfzva2mkmb76p93hq" }
}
```

An error has a human-readable `message`, and `error` when there is machine-readable detail:

```json
{
  "status": "error",
  "message": "Validation failed",
  "error": [{ "path": ["email"], "message": "must be a valid email address" }],
  "metadata": { "status_code": 400, "request_id": "req_01m4zyktdzfzva2mn4svp2rqqm" }
}
```

Responses contain only the documented fields.

## Pagination

List endpoints accept these query parameters:

| Parameter    | Default | Meaning                                                              |
| ------------ | ------- | -------------------------------------------------------------------- |
| `page`       | `1`     | Page number, starting at 1. `-1` returns every record in one page    |
| `limit`      | `20`    | Items per page, 1 to 100. `-1` returns every record in one page      |
| `sort_by`    | `id`    | Field to sort by. `/api/users` accepts `id`, `email` and `name`      |
| `sort_order` | `asc`   | `asc` or `desc`                                                      |

A paginated response adds the position to `metadata` and navigation to `links`:

```json
{
  "status": "success",
  "data": [{ "id": 1, "email": "ada@example.com", "name": "Ada Lovelace" }],
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
| `404`  | Unknown path, or unknown user (`"error": { "id": 9999 }`) |
| `409`  | The user already exists (duplicate email) |
| `413`  | Request body larger than `BODY_LIMIT` |
| `499`  | The client closed the connection before the response |
| `500`  | Server-side failure; details go to the log, never to the client |
| `504`  | The request exceeded `REQUEST_TIMEOUT` |

## Request ID

Every response carries an `x-request-id` header, repeated as `metadata.request_id`. Send your own to continue an upstream trace:

```bash
curl -H 'x-request-id: req_from_gateway' http://localhost:3000/api/users
```

> [!NOTE]
> Error responses include CORS headers too, so the request ID and CORS survive on `4xx` and `5xx` alike.
