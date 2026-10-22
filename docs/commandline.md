# Command line

Run application commands from source with `pnpm app <command>`. Global options include `--version`,
`--log-level <level>`, and `--help`.

## Server

```sh
serve                Start the application server
  --auto-migrate     Apply pending migrations before starting
  --seed             Run seeders; requires --auto-migrate or DATABASE_AUTO_MIGRATE=true
```

## Database migrations

```sh
migrate:up       Apply pending migrations
migrate:down     Roll back the latest migration
migrate:status   Show applied and pending migrations
migrate:reset    Roll back all migrations
migrate:seed     Run database seeders
```

Migrations and seeders use the configured SQLite database (`DATABASE_PATH`). Destructive commands
ask for confirmation; pass `--force` to skip the prompt. There is no remote database option.
