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
copies in the UI — the provisioner owns them and overwrites them on every start.

A tile names its source and connection; `resolve-dashboard-refs.mjs` turns those names into the
ids HyperDX stores before provisioning, because the ids are regenerated whenever the stack is
recreated. Run `vpr compose:dashboards` to render every tile through HyperDX's own
`renderChartConfig` and report which ones come back empty or fail — it is the check that catches
a tile whose source, connection, or query is wrong.

Redis metrics arrive through a `redis_exporter` sidecar. The all-in-one image generates its own
collector configuration, so `container/clickstack/otel-extra.yaml` is merged over it to add that
scrape target.

The application exports `http_requests` (counter), `http_request_duration_seconds`
(histogram), and the Node.js runtime gauges `nodejs.eventloop.*`, `v8js.memory.heap.*` and
`process.cpu.utilization`, sampled every ten seconds from `src/observer/runtime-metrics.ts`.
The names follow the Node.js OpenTelemetry semantic conventions, so a dashboard written against
that convention reads this service without a mapping layer.
