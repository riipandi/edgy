# Development

Day-to-day commands for working on the server.

## Commands

```bash
pnpm dev            # the Node.js server with --watch (same as pnpm watch:node)
pnpm watch:node     # the Node.js server with --watch (auto-restart on change)
pnpm watch:worker   # the Cloudflare Worker from source, in workerd with a local D1 database
pnpm preview        # build the Worker (minified), then run that file in workerd
pnpm build:node     # bundle the Node.js server into dist/server
pnpm build:worker   # bundle the Worker into dist/worker/index.mjs
pnpm test         # vitest run
pnpm test:watch   # vitest, re-runs on change
pnpm typecheck    # tsc --noEmit
pnpm check        # oxfmt --check + oxlint (read-only; what a hook or CI should run)
pnpm format       # oxfmt --write .
pnpm lint         # oxlint --fix . (rewrites files)
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
pnpm watch:worker       # http://127.0.0.1:3000, from source
pnpm preview            # http://127.0.0.1:3000, from dist/worker/index.mjs
```

To prepare or inspect that same database from the CLI, select the `d1` driver:

```bash
DATABASE_DRIVER=d1 pnpm app migrate:status
DATABASE_DRIVER=d1 pnpm app migrate:up
```

## Tests

Tests use [Vitest](https://vitest.dev) and sit next to the code they cover (`*.test.ts`). They build the
real application over a private in-memory database and call it in-process, so no port is opened.
`pnpm test` also checks that `.env.example` matches the configuration.

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
