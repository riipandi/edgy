# Command line

Run application commands from source with `vpr app <command>`. Global options include `--version`,
`--log-level <level>`, and `--help`.

## Server

```sh
serve                Start the application server
  --auto-migrate     Apply pending migrations before starting
  --seed             Run seeders; requires --auto-migrate or DATABASE_AUTO_MIGRATE=true
```

The server shuts down gracefully: `SIGINT` and `SIGTERM` are awaited by the serve command itself.
The log records `shutting down (received <signal>)` when the signal arrives, then each resource
reports its own teardown — the HTTP server drains in-flight requests (up to its 20-second shutdown
timeout) and logs `server stopped accepting connections`, the database logs `closing database
connection` and `database connection closed`, a Redis-backed rate-limit or cache store logs its
close the same way, and `application terminated` lands after every finalizer has finished. The
process exits `0`; a second signal exits immediately.

## Health

```sh
healthcheck      Check application readiness (database ping)
```

The command pings the configured database and exits `0` when it answers, `1` when it fails or stays
silent. The Docker image runs this command as its container healthcheck.

## Database migrations

```sh
migrate:up       Apply pending migrations
  --to <name>    Apply only up to this migration name
  --dry-run      List pending migrations without applying them

migrate:down     Roll back executed migrations
  --count <n>    How many to roll back (default 1)
  --dry-run      List what would roll back

migrate:status   Show applied and pending migrations

migrate:reset    Roll back all migrations
  --up           Re-apply all migrations after the rollback
  --seed         Run the seeders after the re-apply (requires --up)
  --dry-run      Print what would roll back

migrate:seed     Run database seeders
  --dry-run      Report what would be seeded
```

Migrations and seeders use the configured SQLite database (`DATABASE_PATH`). `migrate:down --count`
must be at least `1`. Destructive commands ask for confirmation; pass `--force` to skip the prompt.
There is no remote database option.

## Configuration example

```sh
config:generate                 Generate `.env.example` from the application configuration
  --check                       Fail if `.env.example` is missing or out of date
  --output, -o <path>            Choose another output path
  --stdout                      Print the generated content instead of writing it
  --overwrite                   Replace an existing file after confirmation
  --force                       Skip confirmation; requires `--overwrite`
```

The command refuses real `.env` files, including through symlinks. It does not replace an existing
file unless `--overwrite` is set; use `--check` in CI to detect stale configuration examples.
