# Development

## Commands

```bash
vpr dev                # run the Node.js server and pages with Vite
vpr build              # build the server and browser assets
vpr preview            # run the production build locally
vpr start              # run the built server
vpr build:standalone   # build the application with bundled vendors
vpr compose:up         # start the local development stack
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

## Frontend

The server renders HTML pages as well as the JSON API. A page is built on the server, streamed to the
browser, and brought to life there only where it is interactive.

### What you write

Pages are [SolidJS](https://solidjs.com) components; styles are TypeScript, compiled to plain CSS at
build time by [StyleX](https://stylexjs.com). Routes are file-based:

| Where                           | What it holds                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `src/routes/`                   | One component file per URL. `users/[id].tsx` answers `/users/:id`                       |
| `src/routes/(app)/`             | A route group: a sibling layout file (for example `users.tsx`) wraps the folder's pages |
| `src/routes/(app)/[...404].tsx` | The catch-all page for unknown URLs                                                     |
| `src/resources/styles/pages/`   | The StyleX styles a page uses, one file per page                                        |
| `src/resources/styles/core/`    | The design tokens, colors, and shared utility styles (`fx`)                             |
| `src/resources/components/`     | Components shared across pages                                                          |

Styles apply through the `sx` prop helper (`src/resources/styles/props.ts`): pass the style objects a
StyleX file exports, and the compiler extracts the CSS and hands back stable class names.

```tsx
<h2 {...sx(fx.h2, userStyles.detailTitle)}>{user().name}</h2>
```

### Adding a page

1. Add a component file under `src/routes/`; the file path becomes the URL.
2. Write the styles it needs in `src/resources/styles/pages/` and apply them with `sx`.
3. Load its data through the typed client functions in `src/modules/user/user_fn.ts` (or add a sibling
   function there) so a page and its API endpoint cannot disagree.

### Data and not-found states

Page data loads through `@solidjs/router`'s `query` wrappers over the same client functions the
browser uses; on the server the calls resolve against the application services directly, so a page
never invents a second transport. A lookup that finds nothing returns `undefined` — render a
not-found branch for it (the user detail page is the worked example), and the catch-all route covers
unknown URLs.

### Working on pages

```bash
vpr dev
```

Editing a component or a style updates the open browser tab without a reload. Editing server code
restarts the application (about a second) and reloads the page. `vpr typecheck` also checks the
components, so a misspelled field fails there and not in the browser.

### How pages are served

| Where             | What happens                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vpr dev`         | Vite serves scripts and styles from the source folders                                                                                                             |
| Node.js build     | The server serves the built files under `/assets`; a file's name carries its content hash, so it is sent with `Cache-Control: public, max-age=31536000, immutable` |
| Single executable | The built files are inside the executable                                                                                                                          |

## Observability

`vpr compose:up` starts the local OTLP collector and its UI. Set
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` when using a different collector.
Tracing and metrics export over OTLP by default; set `OTEL_SDK_DISABLED=true` to disable them.
Select the `otlp` value in `LOG_TRANSPORT` to export logs as well. See
[Configuration](./configuration.md) for the full list of options.

The stack ships six dashboards, provisioned from `container/clickstack/dashboards` on
`vpr compose:up`: `Application Overview` (traffic, latency, errors, and the storage footprint
per service), `Application Errors`, `Redis Database`, `ClickHouse Database` (size, disk capacity,
writes, and query latency split into application and infrastructure data), `Pipeline Collector`,
and `Node.js Runtime Metrics`. Edit those JSON files rather than the copies in the UI —
`container/clickstack/provision.sh` owns them and overwrites them on every start. Every dashboard
carries the `edgy` tag plus one area tag (`application`, `infra`, `runtime`), which is also how the
provisioner knows which dashboards it may remove: a file that is renamed or deleted takes its old
dashboard with it, while a dashboard created by hand is left alone.

The files are written in the shape the v2 REST API accepts, with each tile and filter naming its
source and connection; the provisioner resolves those names to the ids HyperDX assigned, because
the ids are regenerated whenever the stack is recreated. A dashboard that already exists is
updated in place, so a restart never leaves duplicates behind.

The ClickHouse connection and the four sources are declared in `compose.yaml` as
`DEFAULT_CONNECTIONS` and `DEFAULT_SOURCES` instead of relying on the image defaults, which carry
an empty ClickHouse password and point the log and trace sources at a key-rollup table the current
schema no longer creates — either one makes every dashboard query fail. `provision.sh` applies both
lists on every start, so a stack created before a value changed is brought in line instead of
keeping the old record.

Redis metrics arrive through a `redis_exporter` sidecar. The all-in-one image generates its own
collector configuration, so `container/clickstack/otel-collector.yaml` is merged over it to add that
scrape target.

The application exports `http_requests` (counter), `http_request_duration_seconds`
(histogram), and the Node.js runtime gauges `nodejs.eventloop.*`, `v8js.memory.heap.*` and
`process.cpu.utilization`, sampled every ten seconds from `src/observer/runtime-metrics.ts`.
The names follow the Node.js OpenTelemetry semantic conventions, so a dashboard written against
that convention reads this service without a mapping layer.
