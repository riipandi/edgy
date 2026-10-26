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
dependencies — the SSR bundle included — into one executable JavaScript entry;
it is not a native binary. The build fails if any external package import
remains in the output, so the bundle runs without a resolved `node_modules`
tree. The one exception is a compiled addon: the SQLite engine loads its
native binding at runtime, so the standalone build writes that package into
`dist/node_modules/@tursodatabase/` for the platform it built on. Copy `dist/`
whole and the entry runs anywhere that platform runs.

Run the bundled server with:

```bash
vpr start
```

The application requires Node.js 24.22 or newer. It needs no database service: the default
`DATABASE_URL` points at a local SQLite file through Turso's engine, whose native binding ships with
the bundle's `node_modules/@tursodatabase` directory. Point `DATABASE_URL` at a writable persistent
location before starting the process, or at a remote Turso database (`libsql://`/`turso://` plus
`DATABASE_TOKEN`) to keep no local state.

## Runtime configuration

Set `SERVER_HOST` and `SERVER_PORT` for the listener. Use `DATABASE_AUTO_MIGRATE=true`
to apply migrations at startup, or run `vpr app migrate:up` as a release step.
A local database file serves one host: the engine's multi-process WAL mode lets
several processes on that host share it, and a network filesystem does not carry
the locking it relies on. Deploy a remote Turso database (`DATABASE_URL` plus
`DATABASE_TOKEN`) to run several instances against one store. Rate-limit windows
and cached lookups can be shared between instances through Redis when
`REDIS_ENABLE=true`; without Redis each instance keeps its own counters and cache.

A standalone build ships an [Oxmgr](https://github.com/Vladimir-Urik/OxMgr) config
(`oxfile.toml`) for running one worker per CPU on a single host, which the
multi-process database mode above supports. Using it is optional — a plain
single-process deploy needs no changes — and cluster mode is off by default in
the generated file. Run migrations once, separately from a multi-worker start,
so two workers never race to migrate the same database.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` for your
collector. The server exports traces and metrics when `OTEL_SDK_DISABLED` is
false; add `otlp` to `LOG_TRANSPORT` to export logs. Keep collector credentials
in the runtime environment and do not commit them.

## Container healthcheck

The Docker image defines a container healthcheck that runs `entry.js healthcheck`.
The command pings the database and exits `0` when the application is ready,
`1` when the database fails or does not answer. Docker marks the container
unhealthy while the command keeps failing.

## The compose stack

```bash
vpr compose:up     # docker compose up --detach --remove-orphans
vpr compose:down   # docker compose down --remove-orphans
```

`vpr compose:up` starts seven services: ClickStack (the telemetry UI, ClickHouse,
MongoDB, and the OTLP collector in one container), the application itself,
cAdvisor, Redis, the Redis exporter, and Mailpit. The application builds from
the project Dockerfile on first start, runs with a 256 MB memory limit, and
publishes its port on `127.0.0.1` — the same server that runs on the host is
what compose serves, with its database file under `.storage/app` and its
telemetry flowing to the collector inside the network. The compose variables
are listed in [configuration](./configuration.md#compose-observability-stack).

The UI answers at `http://localhost:8080` (first-run credentials in the
configuration table). The OTLP endpoint `http://localhost:4318` is for
processes running on the host; the compose application already points at the
collector through the internal network address. Telemetry retention defaults
to 30 days and follows `CLICKSTACK_RETENTION_DAYS` (see
[configuration](./configuration.md#compose-observability-stack)).

## Container resource metrics

cAdvisor runs privileged inside the stack and exports per-container CPU,
memory, and restart signals, which the collector scrapes into the same
telemetry pipeline. The Node.js Runtime Metrics dashboard carries three
container tiles for the application: memory working set against the container
limit, CPU throttling seconds, and restarts observed in the selected window.
A rising working set toward the limit or a nonzero restart count is the signal
that the memory limit is doing its job — the in-process runtime gauges on the
same dashboard cannot see either.

## Alerting

The provisioner applies two alerts beside the dashboards, but only when
`CLICKSTACK_ALERT_WEBHOOK_URL` is set: one fires when the application has sent
no trace spans for ten minutes (telemetry loss, not application health), and
one fires when the collector refuses or fails to export above zero in a
five-minute window. With the key unset, no alerting is provisioned — treat the
unset state as "dashboards only". The Application SLI dashboard's telemetry
freshness tile shows the same signal continuously as a fresh, stale, or silent
verdict per telemetry signal, so a quiet dashboard can be told apart from a
broken pipeline without waiting for an alert to fire.
