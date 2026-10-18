# Development

Day-to-day commands for working on the server.

## Commands

```bash
vpr dev               # the Node.js server and the pages in one Vite dev server, with hot updates
vpr build             # build the Node.js server and the browser assets into dist/server
vpr preview           # run what `vpr build` wrote (build first; the Node server on this address)
vpr start             # run the server already built in dist/server, reading .env.local if there is one
vpr compile           # a single executable, dist/edgy (experimental)
vpr compose:up        # start ClickStack (traces, metrics, logs) and Valkey in Docker
vpr compose:down      # stop them; their data stays in .storage
vpr compose:restart   # down, then up
vpr compose:cleanup   # stop them and delete their data
vpr test              # vitest run
vpr test:coverage     # the same, with a coverage report in .output/tests-results/coverage
vpr e2e:install       # download the browser the end-to-end tests drive (once)
vpr e2e               # end-to-end tests in Chromium, Firefox, Safari (WebKit) and a mobile Chrome, against the production build
vpr e2e --project Chromium   # one browser (the names are in playwright.config.ts)
vpr e2e:chrome        # ... one browser with its window shown (also e2e:firefox, e2e:safari, e2e:mobile)
vpr e2e:ui            # Playwright's UI mode: pick tests, watch each step, time-travel
vpr e2e:report        # open the HTML report of the last run (.output/e2e-result)
vpr test:report       # serve .output/tests-results (open /coverage/ for the coverage report)
vpr typecheck         # tsc --noEmit, then the page templates
vpr check             # oxfmt --check + oxlint (read-only; what a hook or CI should run)
vpr format            # oxfmt --write .
vpr lint              # oxlint --fix . (rewrites files)
```

## Running from source

The entry point is `src/main.ts`, run directly by Node — no build step for the commands that do not
serve pages (Node strips the TypeScript types natively):

```bash
vpr app <command> [flags]
```

Starting the server (`serve`) is the exception: pages are templates that only Vite can load, so use
`vpr dev` while developing and a build (`vpr build`) to run it otherwise. `vpr dev` is the
Vite dev server with the application running inside it: one process, one port (`HOST` and `PORT`,
by default `127.0.0.1:3000`; a busy port is an error; both are set in `vite.config.ts`, where any other
server option goes too), reading `.env.local` for you. Editing a page
or a style updates the browser; editing server code starts the application over in the same process
and reloads the page. The database is migrated for you on each start (set
`DATABASE_AUTO_MIGRATE=false` to stop that); there is no `--auto-migrate` flag here. See the
[CLI documentation](./commandline.md) for the command list and flags, and [Pages](./frontend.md) for
the pages themselves.

## Database workflow

Migrations are applied explicitly — nothing runs automatically except under `vpr dev`, or when the
server starts with `serve --auto-migrate` (migrations only, never seeds):

```bash
vpr app migrate:status     # check what is applied / pending
vpr app migrate:up         # apply pending migrations
vpr app migrate:down       # roll back the last migration
vpr app migrate:reset --up --seed   # fresh schema + sample data (also needed once after ids became TypeIDs)
```

New migrations are added as a file plus a registry entry; see the CLI documentation for the
command-level flags and the confirmation behaviour of destructive commands.

## Cloudflare Workers locally

`vpr dev --mode worker` starts the Worker in `workerd`, the runtime Cloudflare uses, with a local D1
database stored under `.wrangler/`. Pending migrations are applied when the Worker starts
(`DATABASE_AUTO_MIGRATE` in `wrangler.jsonc`), so a fresh checkout works with no extra step. `vpr preview --mode worker` does the same with the built, minified Worker, which is what
`vpr deploy` ships:

```bash
vpr dev --mode worker       # from source, with hot updates, at http://127.0.0.1:3000
vpr preview --mode worker   # the build in dist/worker, at the same address
```

The Worker reads local overrides from `.dev.vars`, not from `.env.local`.

To prepare or inspect that same database from the CLI, select the `d1` driver:

```bash
DATABASE_DRIVER=d1 vpr app migrate:status
DATABASE_DRIVER=d1 vpr app migrate:up
```

## Observability stack

`vpr compose:up` starts ClickStack
(HyperDX with ClickHouse and an OpenTelemetry collector) and Valkey, a Redis-compatible store, in Docker.
The application keeps running on your machine (`vpr dev`); the containers only receive its telemetry
and hold its shared rate-limit counters and cache entries. The first start takes about a minute while ClickStack
initialises, and creates a development account for you.

```bash
vpr compose:up
```

| What           | Where / value                                                               |
| -------------- | --------------------------------------------------------------------------- |
| HyperDX        | http://localhost:8080, sign in with `admin@example.com` and `@Password123!` |
| OTLP over HTTP | http://localhost:4318 (gRPC is deliberately not exposed)                    |
| Ingestion key  | `edgy-dev-ingestion-key`                                                    |
| Valkey         | `redis://:securedb@localhost:6379`                                          |

The containers listen on `127.0.0.1` only. The account, the key and the Valkey password are
development defaults, not secrets, so they must not be reachable from the network; to share the stack
with another machine, put your own credentials on it first.

The application is already pointed at it: the defaults of `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS` and `REDIS_URL` are exactly the values above, so traces and metrics flow
as soon as `vpr dev` runs. Two things stay opt-in, for example in `.env.local`:

```bash
LOG_TRANSPORT=console,otlp   # also ship logs
RATE_LIMIT_ENABLED=true      # turn rate limiting on
RATE_LIMIT_STORE=redis       # counters shared by several instances
```

To run without the stack, set `OTEL_SDK_DISABLED=true` (otherwise the exporters retry quietly in the
background).

Requests then show up in HyperDX as traces, with their logs and the database calls beneath them. If
8080, 4318 or 6379 are already taken on your machine, set `CLICKSTACK_UI_PORT`, `OTLP_HTTP_PORT` or
`VALKEY_PORT` before `vpr compose:up`, and set `OTEL_EXPORTER_OTLP_ENDPOINT` / `REDIS_URL` to the matching port. The keys and
passwords here are for development only.

## Tests

Tests use [Vitest](https://vitest.dev) with [`@effect/vitest`](https://effect.website) and sit next to
the code they cover (`*.test.ts`). Vitest loads the pages through the same Vite plugins as a build. They build the real application over a private in-memory database
and call it in-process, so no port is opened; the OpenTelemetry collector is replaced by a fake that
records what is sent. Effect tests run on a controlled clock, so retries and timeouts are stepped
through, not waited for. Interactive page components are tested on their own in a simulated browser, next to
the component, by acting on them as a user would: typing in the filter and checking the list. `vpr test` also checks that `.env.example` matches the configuration.

Coverage (`vpr test:coverage`) is measured over `src/` with V8's native coverage: no code is instrumented, so
the Marko and vanilla-extract transforms run as they do in a build, and the numbers cost about a second on
top of the test run. Code the tests cannot reach by design (the CLI commands, the server and Worker entries,
the dev server) shows as uncovered; read the report per file rather than as one total.

End-to-end tests (`vpr e2e`) run in real browsers with [Playwright Test](https://playwright.dev), apart from
Vitest. They build the production server, start it with a fresh seeded database, and open its pages: the filter on
`/users` working shows the page hydrated, and a page that raises a Content-Security-Policy violation fails. Files
ending `.spec.ts` in `e2e/` are end-to-end (set `E2E_BASE_URL` to test a production server that is already running instead of starting one; a `Dev` project also starts `vpr dev` and checks that a style edit reaches an open page); `.test.ts` files are the unit and integration tests.

## Validation before claiming a change works

```bash
vpr typecheck && vpr check && vpr test && vpr e2e
```

Plus a run against the real artifacts — a green test suite does not exercise the built bundles:

```bash
vpr build
DATABASE_PATH=$(mktemp -d)/probe.db node dist/server/index.mjs serve --auto-migrate
vpr preview --mode worker   # the Worker build, in workerd
```

## Related docs

- [Pages](./frontend.md) — writing a page, styling, how it is served
- [Deployment](./deployment.md) — Node.js and Worker builds, single executable
- [Configuration](./configuration.md) — environment variables and defaults
- [CLI](./commandline.md) — commands and flags
- [API endpoints](./api-endpoint.md) — endpoint list and request ID tracing
