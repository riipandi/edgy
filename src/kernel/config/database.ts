import { choice, flag, group, text, type ValueOf } from './field.ts'

export const databaseConfig = group(
  {
    driver: choice('DATABASE_DRIVER', ['sqlite'], 'sqlite', 'Database driver'),
    path: text('DATABASE_PATH', 'storage/data/app.db', 'SQLite file path, or :memory:'),
    autoMigrate: flag('DATABASE_AUTO_MIGRATE', false, 'Apply pending migrations before serving')
  },
  'Database'
)

export type DatabaseConfig = ValueOf<typeof databaseConfig>
