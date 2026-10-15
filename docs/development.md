# Development

Day-to-day commands for working on the server.

## Commands

```bash
pnpm watch        # server with --watch (auto-restart on change)
pnpm typecheck    # tsc --noEmit
pnpm check        # oxfmt --check + oxlint
pnpm format       # oxfmt --write .
pnpm lint         # oxlint --fix .
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

## Validation before claiming a change works

There is no test suite yet (`pnpm test` is a placeholder), so the working validation is:

```bash
pnpm typecheck && pnpm check
```

Plus a runtime probe on a fresh database — a green typecheck does not exercise the composition
root:

```bash
DATABASE_PATH=$(mktemp -d)/probe.db pnpm app migrate:up
DATABASE_PATH=$(mktemp -d)/probe.db pnpm app serve   # then curl an endpoint
```

## Related docs

- [Deployment](./deployment.md) — building, bundling, single executable
- [Configuration](./configuration.md) — environment variables and defaults
- [CLI](./commandline.md) — commands and flags
- [API endpoints](./api-endpoint.md) — endpoint list and request ID tracing
