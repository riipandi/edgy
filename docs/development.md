# Development

Day-to-day commands for working on the server.

## Commands

```bash
pnpm dev               # the Node.js server with --watch (same as pnpm watch:node)
pnpm watch:node        # the Node.js server with --watch (auto-restart on change)
pnpm watch:worker      # the Cloudflare Worker from source, in workerd with a local D1 database
pnpm preview           # build the Worker (minified), then run that file in workerd
pnpm build:node        # bundle the Node.js server into dist/server
pnpm build:worker      # bundle the Worker into dist/worker/index.mjs
pnpm compose:up        # start ClickStack (traces, metrics, logs) and Valkey in Docker
pnpm compose:down      # stop them; their data stays in .storage
pnpm compose:restart   # down, then up
pnpm compose:cleanup   # stop them and delete their data
pnpm test              # vitest run
pnpm test:watch        # vitest, re-runs on change
pnpm typecheck         # tsc --noEmit
pnpm check             # oxfmt --check + oxlint (read-only; what a hook or CI should run)
pnpm format            # oxfmt --write .
pnpm lint              # oxlint --fix . (rewrites files)
```

## Running from source

The entry point is `src/main.ts`, run directly by Node — no build step in development
(Node strips the TypeScript types natively):

```bash
pnpm app <command> [flags]
```

See the [CLI documentation](./commandline.md) for the command list and flags.

## Database workflow

Migrations are applied explicitly — nothing runs automatically unless the server starts with
`serve --auto-migrate` (migrations only, never seeds):

```bash
pnpm app migrate:status     # check what is applied / pending
pnpm app migrate:up         # apply pending migrations
pnpm app migrate:down       # roll back the last migration
pnpm app migrate:reset --up --seed   # fresh schema + sample data
```

New migrations are added as a file plus a registry entry; see the CLI documentation for the
command-level flags and the confirmation behaviour of destructive commands.

## Cloudflare Workers locally

`pnpm watch:worker` starts the Worker in `workerd`, the runtime Cloudflare uses, with a local D1
database stored under `.wrangler/`. Pending migrations are applied when the Worker starts
(`DATABASE_AUTO_MIGRATE` in `wrangler.jsonc`), so a fresh checkout works with no extra step.
`pnpm preview` does the same with the built, minified bundle, which is what `pnpm deploy` ships:

```bash
pnpm watch:worker     # http://127.0.0.1:3000, from source
pnpm preview          # http://127.0.0.1:3000, from dist/worker/index.mjs
```

To prepare or inspect that same database from the CLI, select the `d1` driver:

```bash
DATABASE_DRIVER=d1 pnpm app migrate:status
DATABASE_DRIVER=d1 pnpm app migrate:up
```

## Observability stack

`pnpm compose:up` starts ClickStack
(HyperDX with ClickHouse and an OpenTelemetry collector) and Valkey, a Redis-compatible store, in Docker.
The application keeps running on your machine (`pnpm dev`); the containers only receive its telemetry
and hold its shared rate-limit counters. The first start takes about a minute while ClickStack
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

The application is already pointed at it: the defaults of `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS` and `REDIS_URL` are exactly the values above, so traces and metrics flow
as soon as `pnpm dev` runs. Two things stay opt-in, for example in `.env.local`:

```bash
LOG_TRANSPORT=console,otlp   # also ship logs
RATE_LIMIT_STORE=redis       # counters shared by several instances (with RATE_LIMIT_MAX above 0)
```

To run without the stack, set `OTEL_SDK_DISABLED=true` (otherwise the exporters retry quietly in the
background).

Requests then show up in HyperDX as traces, with their logs and the database calls beneath them. If
8080, 4318 or 6379 are already taken on your machine, set `CLICKSTACK_UI_PORT`, `OTLP_HTTP_PORT` or
`VALKEY_PORT` before `pnpm compose:up`, and set `OTEL_EXPORTER_OTLP_ENDPOINT` / `REDIS_URL` to the matching port. The keys and
passwords here are for development only.

## Tests

Tests use [Vitest](https://vitest.dev) with [`@effect/vitest`](https://effect.website) and sit next to
the code they cover (`*.test.ts`). They build the real application over a private in-memory database
and call it in-process, so no port is opened; the OpenTelemetry collector is replaced by a fake that
records what is sent. Effect tests run on a controlled clock, so retries and timeouts are stepped
through, not waited for. `pnpm test` also checks that `.env.example` matches the configuration.

## Validation before claiming a change works

```bash
pnpm typecheck && pnpm check && pnpm test
```

Plus a run against the real artifacts — a green test suite does not exercise the built bundles:

```bash
pnpm build:node
DATABASE_PATH=$(mktemp -d)/probe.db node dist/server/index.mjs serve --auto-migrate
pnpm preview   # the Worker bundle, in workerd
```

## Related docs

- [Deployment](./deployment.md) — Node.js and Worker builds, single executable
- [Configuration](./configuration.md) — environment variables and defaults
- [CLI](./commandline.md) — commands and flags
- [API endpoints](./api-endpoint.md) — endpoint list and request ID tracing
