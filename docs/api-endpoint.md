# API Endpoint

| Method | Path                          | Description                        |
| ------ | ----------------------------- | ---------------------------------- |
| `GET`  | `/`                           | Health check                       |
| `GET`  | `/users`                      | List users                         |
| `GET`  | `/users/:id`                  | Fetch one user                     |
| `POST` | `/users`                      | Create a user from a JSON body (`201`) |
| `GET`  | `/.well-known/security.txt`   | Contact metadata (RFC 9116 style)  |

## Errors

Responses contain only the documented fields. Errors are JSON. A body that fails validation answers `400`:

```json
{ "error": "Validation failed", "issues": [{ "path": ["email"], "message": "must be a valid email address" }] }
```

An unknown user answers `404` with `{ "error": "User not found", "id": 9999 }`. Server-side failures answer
`500` with a generic message; details go to the log, never to the client.

## Request ID

Every response carries an `x-request-id` header. Send your own to continue an upstream trace:

```bash
curl -H 'x-request-id: req_from_gateway' http://localhost:3000/users
```

> [!NOTE]
> Error responses include CORS headers too — H3 merges `event.res.errHeaders` into error responses,
> so the request ID and CORS survive on `4xx` and `5xx` alike.
