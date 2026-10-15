# Development

Day-to-day commands for working on the server.

## Commands

```bash
pnpm dev               # the Node.js server and the pages in one Vite dev server, with hot updates
pnpm build             # build the Node.js server and the browser assets into dist/server
pnpm preview           # run what `pnpm build` wrote (build first; the Node server on this address)
pnpm start             # run the server already built in dist/server, reading .env.local if there is one
pnpm compile           # a single executable, dist/edgy (experimental)
# The same three for the Cloudflare Worker (workerd, a local D1 database), by adding the mode:
pnpm dev --mode worker
pnpm build --mode worker
pnpm preview --mode worker
pnpm compose:up        # start ClickStack (traces, metrics, logs) and Valkey in Docker
pnpm compose:down      # stop them; their data stays in .storage
pnpm compose:restart   # down, then up
pnpm compose:cleanup   # stop them and delete their data
pnpm test              # vitest run
pnpm test:coverage     # the same, with a coverage report in .output/tests-results/coverage
pnpm test:report       # serve .output/tests-results (open /coverage/ for the coverage report)
pnpm typecheck         # tsc --noEmit, then the page templates
pnpm check             # oxfmt --check + oxlint (read-only; what a hook or CI should run)
pnpm format            # oxfmt --write .
pnpm lint              # oxlint --fix . (rewrites files)
```

## Running from source

The entry point is `src/main.ts`, run directly by Node — no build step for the commands that do not
serve pages (Node strips the TypeScript types natively):

```bash
pnpm app <command> [flags]
```

Starting the server (`serve`) is the exception: pages are templates that only Vite can load, so use
`pnpm dev` while developing and a build (`pnpm build`) to run it otherwise. `pnpm dev` is the
Vite dev server with the application running inside it: one process, one port (`HOST` and `PORT`,
by default `127.0.0.1:3000`; a busy port is an error; both are set in `vite.config.ts`, where any other
server option goes too), reading `.env.local` for you. Editing a page
or a style updates the browser; editing server code starts the application over in the same process
and reloads the page. The database is migrated for you on each start (set
`DATABASE_AUTO_MIGRATE=false` to stop that); there is no `--auto-migrate` flag here. See the
[CLI documentation](./commandline.md) for the command list and flags, and [Pages](./frontend.md) for
the pages themselves.

## Database workflow

Migrations are applied explicitly — nothing runs automatically except under `pnpm dev`, or when the
server starts with `serve --auto-migrate` (migrations only, never seeds):

```bash
pnpm app migrate:status     # check what is applied / pending
pnpm app migrate:up         # apply pending migrations
pnpm app migrate:down       # roll back the last migration
pnpm app migrate:reset --up --seed   # fresh schema + sample data (also needed once after ids became TypeIDs)
```

New migrations are added as a file plus a registry entry; see the CLI documentation for the
command-level flags and the confirmation behaviour of destructive commands.

## Cloudflare Workers locally

`pnpm dev --mode worker` starts the Worker in `workerd`, the runtime Cloudflare uses, with a local D1
database stored under `.wrangler/`. Pending migrations are applied when the Worker starts
(`DATABASE_AUTO_MIGRATE` in `wrangler.jsonc`), so a fresh checkout works with no extra step. `pnpm preview --mode worker` does the same with the built, minified Worker, which is what
`pnpm run deploy` ships:

```bash
pnpm dev --mode worker       # from source, with hot updates, at http://127.0.0.1:3000
pnpm preview --mode worker   # the build in dist/worker, at the same address
```

The Worker reads local overrides from `.dev.vars`, not from `.env.local`.

To prepare or inspect that same database from the CLI, select the `d1` driver:

```bash
DATABASE_DRIVER=d1 pnpm app migrate:status
DATABASE_DRIVER=d1 pnpm app migrate:up
```

## Observability stack

`pnpm compose:up` starts ClickStack
(HyperDX with ClickHouse and an OpenTelemetry collector) and Valkey, a Redis-compatible store, in Docker.
The application keeps running on your machine (`pnpm dev`); the containers only receive its telemetry
and hold its shared rate-limit counters and cache entries. The first start takes about a minute while ClickStack
initialises, and creates a development account for you.

```bash
pnpm compose:up
```

| What                | Where / value                                                                         |
| ------------------- | ------------------------------------------------------------------------------------- |
| HyperDX             | http://localhost:8080, sign in with `admin@example.com` and `@Password123!`           |
| OTLP over HTTP      | http://localhost:4318 (gRPC is deliberately not exposed)                              |
| Ingestion key       | `edgy-dev-ingestion-key`                                                              |
| Valkey              | `redis://:securedb@localhost:6379`                                                    |

The containers listen on `127.0.0.1` only. The account, the key and the Valkey password are
development defaults, not secrets, so they must not be reachable from the network; to share the stack
with another machine, put your own credentials on it first.

The application is already pointed at it: the defaults of `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS` and `REDIS_URL` are exactly the values above, so traces and metrics flow
as soon as `pnpm dev` runs. Two things stay opt-in, for example in `.env.local`:

```bash
LOG_TRANSPORT=console,otlp   # also ship logs
RATE_LIMIT_ENABLED=true      # turn rate limiting on
RATE_LIMIT_STORE=redis       # counters shared by several instances
```

To run without the stack, set `OTEL_SDK_DISABLED=true` (otherwise the exporters retry quietly in the
background).

Requests then show up in HyperDX as traces, with their logs and the database calls beneath them. If
8080, 4318 or 6379 are already taken on your machine, set `CLICKSTACK_UI_PORT`, `OTLP_HTTP_PORT` or
`VALKEY_PORT` before `pnpm compose:up`, and set `OTEL_EXPORTER_OTLP_ENDPOINT` / `REDIS_URL` to the matching port. The keys and
passwords here are for development only.

## Tests

Tests use [Vitest](https://vitest.dev) with [`@effect/vitest`](https://effect.website) and sit next to
the code they cover (`*.test.ts`). Vitest loads the pages through the same Vite plugins as a build. They build the real application over a private in-memory database
and call it in-process, so no port is opened; the OpenTelemetry collector is replaced by a fake that
records what is sent. Effect tests run on a controlled clock, so retries and timeouts are stepped
through, not waited for. `pnpm test` also checks that `.env.example` matches the configuration.

Coverage (`pnpm test:coverage`) is measured over `src/` with V8's native coverage: no code is instrumented, so
the Marko and vanilla-extract transforms run as they do in a build, and the numbers cost about a second on
top of the test run. Code the tests cannot reach by design (the CLI commands, the server and Worker entries,
the dev server) shows as uncovered; read the report per file rather than as one total.

## Validation before claiming a change works

```bash
pnpm typecheck && pnpm check && pnpm test
```

Plus a run against the real artifacts — a green test suite does not exercise the built bundles:

```bash
pnpm build
DATABASE_PATH=$(mktemp -d)/probe.db node dist/server/index.mjs serve --auto-migrate
pnpm preview --mode worker   # the Worker build, in workerd
```

## Related docs

- [Pages](./frontend.md) — writing a page, styling, how it is served
- [Deployment](./deployment.md) — Node.js and Worker builds, single executable
- [Configuration](./configuration.md) — environment variables and defaults
- [CLI](./commandline.md) — commands and flags
- [API endpoints](./api-endpoint.md) — endpoint list and request ID tracing
