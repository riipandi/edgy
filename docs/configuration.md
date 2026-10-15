# Application Configuration

All configuration is read from environment variables, validated at startup. A value that is present
but invalid (a non-numeric `PORT`, an unknown `DATABASE_DRIVER`) stops the process with an error that
names the variable, instead of failing on the first request.

Every variable is optional. The defaults suit local development.

## Example file

`.env.example` lists every variable with its default and a one-line description. It is generated from
the configuration itself, so it is always complete:

```bash
pnpm app config:generate               # create .env.example (never replaces an existing, different file)
pnpm app config:generate --overwrite   # replace it after a confirmation (--force skips the prompt)
pnpm app config:generate --check       # fail if the file is out of date
cp .env.example .env                # then change only what you need
```

The command never writes a real `.env` file.

## Server

| Variable               | Default      | Description                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------------- |
| `HOST`                 | `0.0.0.0`    | Bind address                                                                |
| `PORT`                 | `3000`       | Bind port                                                                   |
| `BODY_LIMIT`           | `1048576`    | Largest accepted request body in bytes; bigger bodies get `413`             |
| `REQUEST_TIMEOUT`      | `30 seconds` | A request that runs longer is cancelled and answered with `504`             |
| `SHUTDOWN_TIMEOUT`     | `10 seconds` | How long a stop signal waits for requests still being handled               |
| `SHUTDOWN_DRAIN_DELAY` | `0 millis`   | Pause between `/health` turning `503` and the server closing                |
| `TRUST_PROXY`          | `false`      | Read the client address from proxy headers (only behind a proxy you control) |

## Database

| Variable                | Default                  | Description                                                              |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_DRIVER`       | `sqlite`                 | `sqlite` (Node.js) or `d1` (Cloudflare D1)                               |
| `DATABASE_PATH`         | `./storage/data/edgy.db` | SQLite file, or `:memory:`; parent directories are created (`sqlite` only) |
| `D1_BINDING`            | `DB`                     | Name of the D1 binding in `wrangler.jsonc` (`d1` only)                   |
| `DATABASE_AUTO_MIGRATE` | `false`                  | Apply pending migrations when the Worker starts (`d1`, Workers)          |

## Logging

| Variable             | Default      | Description                                                                |
| -------------------- | ------------ | -------------------------------------------------------------------------- |
| `LOG_LEVEL`          | `Info`       | `All` \| `Fatal` \| `Error` \| `Warn` \| `Info` \| `Debug` \| `Trace` \| `None` (**case-sensitive**). `Trace` also prints every SQL statement with its duration (never the values) |
| `LOG_FORMAT`         | `pretty`     | `pretty` for readable lines, `json` for one JSON object per line           |
| `LOG_FLUSH_INTERVAL` | `250 millis` | How long log lines are buffered before they are written together (Node.js) |

## Security

| Variable            | Default    | Description                                                              |
| ------------------- | ---------- | ------------------------------------------------------------------------ |
| `RATE_LIMIT_MAX`    | `0`        | Requests per client per window on `/api`; `0` turns rate limiting off    |
| `RATE_LIMIT_WINDOW` | `1 minute` | Length of the rate-limit window                                          |

The limit is counted per running instance, not across instances. Set `TRUST_PROXY=true` behind a
proxy, otherwise every client appears to have the proxy's address.

## Observability

| Variable          | Default | Description                                                              |
| ----------------- | ------- | ------------------------------------------------------------------------ |
| `METRICS_ENABLED` | `false` | Serve Prometheus metrics at `GET /metrics`                               |

> [!WARNING]
> `/metrics` has no authentication. Enable it only where the port is not reachable from the internet.

## CORS

| Variable             | Default | Description                                              |
| -------------------- | ------- | -------------------------------------------------------- |
| `CORS_ORIGINS`       | `*`     | `*` or a comma-separated allowlist                       |
| `CORS_METHODS`       | `*`     | `*` or a comma-separated list                            |
| `CORS_ALLOW_HEADERS` | `*`     | `*` or a comma-separated list                            |
| `CORS_CREDENTIALS`   | `false` | Send `access-control-allow-credentials`                  |
| `CORS_MAX_AGE`       | `86400` | Preflight cache seconds; `false` or `0` omits the header |

> [!WARNING]
> `CORS_CREDENTIALS=true` requires an explicit `CORS_ORIGINS` allowlist. A wildcard origin is
> invalid for credentialed requests, so the process fails fast at startup instead of sending a
> header browsers will reject.

## Cloudflare Workers

On Workers the same variables go under `vars` in `wrangler.jsonc` (secrets through
`wrangler secret put`). A Worker always uses D1, so `DATABASE_DRIVER` and `DATABASE_PATH` have no
effect there; the binding is the one named by `D1_BINDING`.

## Example

```bash
CORS_ORIGINS="https://app.example.com,https://admin.example.com" \
CORS_CREDENTIALS=true \
LOG_LEVEL=Warn \
PORT=8080 \
pnpm app serve
```
