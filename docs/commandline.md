# Command Line Interface

The application CLI is executed from source using `vpr app <command>` or against built artifacts using `node dist/entry.js <command>`.

```bash
vpr app <command> [flags]
```

## Global flags

The CLI supports three canonical global flags:

| Flag                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `--help`              | Display usage information and available commands or flags.       |
| `--version`           | Print application version information.                           |
| `--log-level <level>` | Set minimum logging severity (`Debug`, `Info`, `Warn`, `Error`). |

## Server commands

```sh
serve                  Start the HTTP application server
    --auto-migrate     Apply pending migrations prior to starting listener
    --seed             Run database seeders after migration (requires --auto-migrate)
```

### Graceful shutdown

The server intercepts `SIGINT` and `SIGTERM` signals and manages orderly process shutdown:

1. Stops accepting incoming HTTP connections.
2. Waits up to 20 seconds for in-flight requests to complete.
3. Closes database connection pools and flushes pending writes.
4. Closes Redis clients and flushes structured logs.
5. Emits `Application terminated` and exits with code `0`. A second signal forces immediate termination (`128 + signal`).

### Cluster mode

To run multiple worker processes supervised across CPU cores, run:

```bash
vpr start:cluster
```

This builds the standalone artifact and launches OxMgr using `oxfile.toml`. Always run migrations (`vpr app migrate:up`) prior to starting cluster mode to prevent workers from competing during migration.

## Health probe

```sh
healthcheck            Run application readiness checks
```

Executes the same probe suite as `GET /api/health` under a 2-second timeout:

- Prints `Healthy` and exits `0` when all dependencies answer.
- Prints `Unhealthy` and exits `1` when any dependency fails.
- Configured as the Docker container healthcheck command.

## Database migrations

```sh
migrate:up             Run pending database migrations
    --to <name>        Apply migrations only up to the specified migration name
    --dry-run          Preview pending migrations without applying changes

migrate:down           Roll back executed database migrations
    --count <n>        Number of migrations to roll back (default: 1)
    --dry-run          Preview migrations that would be rolled back
    --force            Skip interactive confirmation prompt

migrate:status         Display migration execution status and pending list

migrate:reset          Roll back all applied migrations
    --up               Re-apply all migrations after rollback (rebuild schema)
    --seed             Populate database after re-applying migrations (requires --up)
    --dry-run          Preview rollback actions without applying changes
    --force            Skip interactive confirmation prompt

migrate:seed           Seed database with initial sample data
    --dry-run          Preview seed actions without inserting rows
```

Destructive actions (`migrate:down`, `migrate:reset`) prompt for confirmation. In automated scripts and CI environments, supply `--force` to bypass prompts.

### Output format

Migration commands output step reports color-coded by state:

- **Cyan**: In-progress operation (`Applying 4 migration(s)`).
- **Green**: Completed successfully (`Applied 00001_create_platform_tables`).
- **Yellow**: Dry-run preview (`Would apply 00002_create_identity_table`).

## Configuration generator

```sh
generate:config        Generate .env.example from declared configuration schemas
    --output, -o <file>Destination path (default: .env.example)
    --overwrite        Replace target file if contents differ
    --check            Validate that target file is up to date (exits 1 if stale)
    --stdout           Print generated contents to console
    --force            Bypass confirmation prompt when overwriting
```

The generator inspects all typed configuration schemas and emits complete documentation with default values. It prevents overwriting production `.env` files and resolves symbolic links safely. Use `--check` in CI to detect uncommitted configuration changes.
