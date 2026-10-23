# Deployment

Edgy runs as a Node.js server and stores data in SQLite. The HTTP server uses
Effect's Node platform.

## Build

```bash
vpr build
vpr build:standalone
```

`vpr build` creates the server entry and browser assets in `dist/`. Keep the
assets together when copying the build. `vpr build:standalone` bundles server
dependencies into one executable JavaScript entry; it is not a native binary.

Run the bundled server with:

```bash
vpr start
```

The application requires Node.js 24.22 or newer for `node:sqlite`. It does
not need a native SQLite addon or a database service. Set `DATABASE_PATH`
to a writable persistent location before starting the process.

## Runtime configuration

Set `SERVER_HOST` and `SERVER_PORT` for the listener. Use `DATABASE_AUTO_MIGRATE=true`
to apply migrations at startup, or run `vpr app migrate:up` as a release step.
For multi-instance deployments, use a shared SQLite-compatible storage arrangement
only if its locking semantics support concurrent writers. Rate-limit windows
and cached lookups can be shared between instances through Redis when
`REDIS_ENABLE=true`; without Redis each instance keeps its own counters and cache.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` for your
collector. The server exports traces and metrics when `OTEL_SDK_DISABLED` is
false; add `otlp` to `LOG_TRANSPORT` to export logs. Keep collector credentials
in the runtime environment and do not commit them.

## Container healthcheck

The Docker image defines a container healthcheck that runs `entry.js healthcheck`.
The command pings the database and exits `0` when the application is ready,
`1` when the database fails or does not answer. Docker marks the container
unhealthy while the command keeps failing.
