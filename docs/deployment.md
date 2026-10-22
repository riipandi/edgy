# Deployment

Edgy runs as a Node.js server and stores data in SQLite. The HTTP server uses Effect's Node platform;
there is no alternate Worker runtime or D1 driver.

## Build

```bash
pnpm build
pnpm build:standalone
```

`pnpm build` creates the server entry and browser assets in `dist/`. Keep the assets together when
copying the build. `pnpm build:standalone` bundles server dependencies into one executable JavaScript
entry; it is not a native binary.

Run the bundled server with:

```bash
pnpm start
```

The application requires Node.js 24.22 or newer for `node:sqlite`. It does not need a native SQLite
addon or a database service. Set `DATABASE_PATH` to a writable persistent location before starting
the process.

## Runtime configuration

Set `HOST` and `PORT` for the listener. Use `DATABASE_AUTO_MIGRATE=true` to apply migrations at
startup, or run `pnpm app migrate:up` as a release step. For multi-instance deployments, use a
shared SQLite-compatible storage arrangement only if its locking semantics support concurrent
writers; the in-memory cache and rate limiter are process-local and do not share state between
instances.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` for your collector. The server
exports traces and metrics when `OTEL_SDK_DISABLED` is false; add `otlp` to `LOG_TRANSPORT` to export
logs. Keep collector credentials in the runtime environment and do not commit them.
