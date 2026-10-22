# Development

## Commands

```bash
pnpm dev               # run the Node.js server and pages with Vite
pnpm build             # build the server and browser assets
pnpm preview           # run the production build locally
pnpm start             # run the built server
pnpm build:standalone  # create a Node.js single executable
pnpm compose:up        # start the local telemetry collector and UI
pnpm compose:down      # stop the telemetry stack
pnpm test              # run unit and integration tests
pnpm typecheck         # check TypeScript
pnpm check             # formatting and lint checks
```

Run CLI commands directly through `pnpm app <command>`. The server uses Effect's HTTP router and
Node HTTP platform. Vite runs the frontend and application together during development; server code
restarts when it changes.

## Database workflow

The app uses SQLite via Node's built-in `node:sqlite`. Set `DATABASE_PATH` to select the database
file. Apply migrations and seed sample data with:

```bash
pnpm app migrate:status
pnpm app migrate:up
pnpm app migrate:seed
```

To migrate before serving, use `pnpm app serve --auto-migrate` or set
`DATABASE_AUTO_MIGRATE=true`. See [Command line](./commandline.md) for migration commands.

## Observability

`pnpm compose:up` starts the local OTLP collector and its UI. Set
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` when using a different collector.
Tracing and metrics export over OTLP by default; set `OTEL_SDK_DISABLED=true` to disable them.
Select the `otlp` value in `LOG_TRANSPORT` to export logs as well. See
[Configuration](./configuration.md) for the full list of options.
