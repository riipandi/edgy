import { choice, flag, group, text, type ValueOf } from './field.ts'

/** Database selection and its driver-specific settings. */
export const databaseConfig = group(
  {
    driver: choice(
      'DATABASE_DRIVER',
      ['sqlite', 'd1'],
      'sqlite',
      'Backend: node:sqlite on Node.js, or Cloudflare D1 (Workers, or local through wrangler)'
    ),
    path: text(
      'DATABASE_PATH',
      './storage/data/edgy.db',
      'SQLite file, or :memory: (driver sqlite only)'
    ),
    d1Binding: text(
      'D1_BINDING',
      'DB',
      'Name of the D1 binding in wrangler.jsonc (driver d1 only)'
    ),
    autoMigrate: flag(
      'DATABASE_AUTO_MIGRATE',
      false,
      'Apply pending migrations when the app starts: on Workers (several isolates may race, prefer migrate:up once the schema exists) and in `pnpm dev`, where leaving it unset means on'
    )
  },
  { title: 'Database' }
)

export type DatabaseConfig = ValueOf<typeof databaseConfig>
