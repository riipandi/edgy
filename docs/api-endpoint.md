# API Endpoint

| Method | Path                          | Description                        |
| ------ | ----------------------------- | ---------------------------------- |
| `GET`  | `/`                           | Health check                       |
| `GET`  | `/users`                      | List users                         |
| `GET`  | `/users/:id`                  | Fetch one user                     |
| `POST` | `/users`                      | Create a user from a JSON body     |
| `GET`  | `/.well-known/security.txt`   | Contact metadata (RFC 9116 style)  |

## Request ID

Every response carries an `x-request-id` header. Send your own to continue an upstream trace:

```bash
curl -H 'x-request-id: req_from_gateway' http://localhost:3000/users
```

> [!NOTE]
> Error responses include CORS headers too — H3 merges `event.res.errHeaders` into error responses,
> so the request ID and CORS survive on `4xx` and `5xx` alike.
