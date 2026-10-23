# Development

## Commands

```bash
vpr dev                # run the Node.js server and pages with Vite
vpr build              # build the server and browser assets
vpr preview            # run the production build locally
vpr start              # run the built server
vpr build:standalone   # create a Node.js single executable
vpr compose:up         # start the local telemetry collector and UI
vpr compose:down       # stop the telemetry stack
vpr test               # run unit and integration tests
vpr typecheck          # check TypeScript
vpr check              # formatting and lint checks
```

Run CLI commands directly through `vpr app <command>`. The server uses Effect's HTTP router and
Node HTTP platform. Vite runs the frontend and application together during development; server code
restarts when it changes.

## Database workflow

The app uses SQLite via Node's built-in `node:sqlite`. Set `DATABASE_PATH` to select the database
file. Apply migrations and seed sample data with:

```bash
vpr app migrate:status
vpr app migrate:up
vpr app migrate:seed
```

To migrate before serving, use `vpr app serve --auto-migrate` or set
`DATABASE_AUTO_MIGRATE=true`. See [Command line](./commandline.md) for migration commands.
With `DATABASE_PATH=:memory:`, startup migrations and requests use the same database for the lifetime of the server.

## Observability

`vpr compose:up` starts the local OTLP collector and its UI. Set
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` when using a different collector.
Tracing and metrics export over OTLP by default; set `OTEL_SDK_DISABLED=true` to disable them.
Select the `otlp` value in `LOG_TRANSPORT` to export logs as well. See
[Configuration](./configuration.md) for the full list of options.

The stack ships six dashboards, provisioned from `container/clickstack/dashboards` on
`vpr compose:up`: the application (throughput, latency, errors, logs), reliability, storage,
the telemetry pipeline, Redis, and Node.js runtime metrics. Edit those JSON files rather than the
copies in the UI — the provisioner owns them and overwrites them on every start. Run
`vpr compose:dashboards` to execute every tile against ClickHouse and report which ones come back
empty; it is the check that catches a tile whose source or query is wrong.

Redis metrics arrive through a `redis_exporter` sidecar. The all-in-one image generates its own
collector configuration, so `container/clickstack/otel-extra.yaml` is merged over it to add that
scrape target.
