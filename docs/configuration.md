# Application Configuration

All configuration is read from environment variables through Effect's `Config`, validated at startup.

| Variable             | Default                    | Description                                                            |
| -------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_PATH`      | `./storage/data/edgy.db`   | SQLite file path; parent directories are created automatically          |
| `HOST`               | `0.0.0.0`                  | Bind address                                                           |
| `PORT`               | `3000`                     | Bind port                                                              |
| `LOG_LEVEL`          | `Info`                     | `All` \| `Fatal` \| `Error` \| `Warn` \| `Info` \| `Debug` \| `Trace` \| `None` (**case-sensitive**) |
| `LOG_FORMAT`         | `pretty`                   | `pretty` for readable lines, `json` for one JSON object per line       |
| `LOG_FLUSH_INTERVAL` | `250 millis`               | How long log lines are buffered before they are written together        |
| `BODY_LIMIT`         | `1048576`                  | Largest accepted request body in bytes; bigger bodies get `413`        |
| `REQUEST_TIMEOUT`    | `30 seconds`               | A request that runs longer is cancelled and answered with `504`        |
| `SHUTDOWN_TIMEOUT`   | `10 seconds`               | How long a stop signal waits for in-flight requests before closing them |
| `CORS_ORIGINS`       | `*`                        | `*` or a comma-separated allowlist                                     |
| `CORS_METHODS`       | `*`                        | `*` or a comma-separated list                                          |
| `CORS_ALLOW_HEADERS` | `*`                        | `*` or a comma-separated list                                          |
| `CORS_CREDENTIALS`   | `false`                    | Send `access-control-allow-credentials`                                |
| `CORS_MAX_AGE`       | `86400`                    | Preflight cache seconds; `false` or `0` omits the header               |

> [!WARNING]
> `CORS_CREDENTIALS=true` requires an explicit `CORS_ORIGINS` allowlist. A wildcard origin is
> invalid for credentialed requests, so the process fails fast at startup instead of sending a
> header browsers will reject.

## Example

```bash
CORS_ORIGINS="https://app.example.com,https://admin.example.com" \
CORS_CREDENTIALS=true \
LOG_LEVEL=Warn \
PORT=8080 \
pnpm app serve
```
