# CLI Documentation

Global flags: `--version`, `--log-level <level>`, `--completions <shell>`, `--help`.

## Server

```
serve                Start the HTTP server
   --auto-migrate    Run pending database migrations before starting
```

## Configuration

```
config:generate      Generate .env.example from the application configuration
   --output, -o      File to write (default: .env.example; never a real .env file)
   --overwrite       Replace an existing file whose content differs (asks for confirmation)
   --force           Skip the confirmation prompt of --overwrite
   --check           Do not write; exit with an error if the file is missing or out of date
   --stdout          Print the generated file instead of writing it
```

## Database Migration
```
migrate:up      Run database migrations
   --to name    Apply migrations only up to this migration name
   --dry-run    List the pending migrations without applying them

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

The migration commands use the database selected by `DATABASE_DRIVER`. With `d1` they run against
the local D1 database that `pnpm watch:worker` and `pnpm preview` serve, so the schema is ready before the Worker starts:

```bash
DATABASE_DRIVER=d1 pnpm app migrate:up
```

Destructive commands (`migrate:down`, `migrate:reset`) ask for confirmation; `--force` skips the
prompt, and non-interactive sessions must pass `--force` explicitly.
