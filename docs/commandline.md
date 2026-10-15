# CLI Documentation

Global flags: `--version`, `--log-level <level>`, `--completions <shell>`, `--help`.

## Database Migration
```
migrate:up      Run database migrations
   --to uint    Apply migrations only up to this version
   --dry-run    List the pending migrations without applying them
   --force      Skip the confirmation prompt

migrate:down     Rollback database migrations
   --count int   Number of migrations to roll back (default: 1)
   --dry-run     List the migrations that would be rolled back without changing anything
   --force       Skip the confirmation prompt

migrate:status    Check database migration status

migrate:create <MIGRATION_NAME>   Create a new migration file

migrate:reset   Rollback all migrations
   --up         Re-apply all migrations after the rollback (fresh schema)
   --seed       Run the seeders after the re-apply (requires --up)
   --dry-run    Print what would be rolled back without changing anything
   --force      Skip the confirmation prompt

migrate:seed    Seed the database with initial data
   --dry-run    Report what would be seeded without changing anything
   --force      Skip the confirmation prompt
```

Destructive commands (`migrate:down`, `migrate:reset`) ask for confirmation; `--force` skips the
prompt, and non-interactive sessions must pass `--force` explicitly.
