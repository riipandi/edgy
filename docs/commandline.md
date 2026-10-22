# Command line

Run application commands from source with `pnpm app <command>`. Global options include `--version`,
`--log-level <level>`, and `--help`.

## Server

```sh
serve                Start the application server
  --auto-migrate     Apply pending migrations before starting
  --seed             Run seeders; requires --auto-migrate or DATABASE_AUTO_MIGRATE=true
```

## Health

```sh
healthcheck      Check application readiness (database ping)
```

The command pings the configured database and exits `0` when it answers, `1` when it fails or stays
silent. The Docker image runs this command as its container healthcheck.

## Database migrations

```sh
migrate:up       Apply pending migrations
migrate:down     Roll back the latest migration
migrate:status   Show applied and pending migrations
migrate:reset    Roll back all migrations
migrate:seed     Run database seeders
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
