# Command line

Run application commands from source with `vpr app <command>`.

Global flags: `--version`, `--log-level <level>`, `--help`.

## Server

```sh
serve                  Start the application server
    --auto-migrate     Apply pending migrations before starting
    --seed             Run the seeders; requires automatic migration
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
migrate:up       Run database migrations
  --to <name>    Apply migrations only up to this migration name
  --dry-run      List the pending migrations without applying them

migrate:down     Rollback database migrations
   --count int   Number of migrations to roll back (default: 1)
   --dry-run     List the migrations that would be rolled back without changing anything
   --force       Skip the confirmation prompt

migrate:status   Check database migration status

migrate:reset   Rollback all migrations
   --up         Re-apply all migrations after the rollback (fresh schema)
   --seed       Run the seeders after the re-apply (requires --up)
   --dry-run    Print what would be rolled back without changing anything
   --force      Skip the confirmation prompt

migrate:seed    Seed the database with initial data
   --dry-run    Report what would be seeded without changing anything
```

Destructive commands (`migrate:down`, `migrate:reset`) ask for confirmation; `--force`
skips the prompt, and non-interactive sessions must pass `--force` explicitly.

## Configuration example

```sh
generate:config      Generate .env.example from the application configuration
   --output, -o      File to write (default: .env.example; never a real .env file)
   --overwrite       Replace an existing file whose content differs (asks for confirmation)
   --check           Do not write; exit with an error if the file is missing or out of date
   --stdout          Print the generated file instead of writing it
   --force           Skip the confirmation prompt of --overwrite
```

The command refuses real `.env` files, including through symlinks. It does not replace an existing
file unless `--overwrite` is set; use `--check` in CI to detect stale configuration examples.
