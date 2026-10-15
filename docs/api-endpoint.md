# API Endpoint

| Method | Path                          | Description                        |
| ------ | ----------------------------- | ---------------------------------- |
| `GET`  | `/`                           | Liveness check                     |
| `GET`  | `/health`                     | Readiness check (database reachable) |
| `GET`  | `/users`                      | List users                         |
| `GET`  | `/users/:id`                  | Fetch one user                     |
| `POST` | `/users`                      | Create a user from a JSON body (`201`) |
| `GET`  | `/.well-known/security.txt`   | Contact metadata (RFC 9116 style)  |

## Errors

Responses contain only the documented fields. Errors are JSON. A body that fails validation answers `400`:

```json
{ "error": "Validation failed", "issues": [{ "path": ["email"], "message": "must be a valid email address" }] }
```

| Status | Meaning |
| ------ | ------- |
| `400`  | Validation failed, or the body is not valid JSON |
| `404`  | Unknown path, or unknown user (`{ "error": "User not found", "id": 9999 }`) |
| `409`  | The user already exists (duplicate email) |
| `413`  | Request body larger than `BODY_LIMIT` |
| `499`  | The client closed the connection before the response |
| `500`  | Server-side failure; details go to the log, never to the client |
| `504`  | The request exceeded `REQUEST_TIMEOUT` |

Every error body has the shape `{ "error": "…" }`, with `issues` added for `400` validation failures.

## Request ID

Every response carries an `x-request-id` header. Send your own to continue an upstream trace:

```bash
curl -H 'x-request-id: req_from_gateway' http://localhost:3000/users
```

> [!NOTE]
> Error responses include CORS headers too — H3 merges `event.res.errHeaders` into error responses,
> so the request ID and CORS survive on `4xx` and `5xx` alike.
