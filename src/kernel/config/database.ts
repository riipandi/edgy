import { Config } from 'effect'

/** Database settings. Variables: `DATABASE_PATH`. */
export const databaseConfig = Config.all({
  /** SQLite file, or `:memory:`. Its parent directory is created on open. */
  path: Config.String('DATABASE_PATH').pipe(Config.withDefault('./storage/data/edgy.db'))
})

export type DatabaseConfig = Config.Success<typeof databaseConfig>
