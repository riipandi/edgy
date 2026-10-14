import { Config, Context, Layer } from 'effect'

/**
 * Shape of the parsed, validated application configuration.
 */
export interface AppConfig {
  readonly databaseFile: string
  readonly host: string
  readonly port: number
}

/**
 * Declarative configuration schema. Missing variables fall back to development
 * defaults; present-but-invalid values (for example a non-numeric `PORT`) fail
 * with a typed `ConfigError` while the layer is being built.
 */
const schema = Config.all({
  databaseFile: Config.String('DATABASE_FILE').pipe(Config.withDefault('./storage/data/edgy.db')),
  host: Config.String('HOST').pipe(Config.withDefault('0.0.0.0')),
  port: Config.Port('PORT').pipe(Config.withDefault(3000))
})

/**
 * Configuration service. Consumers depend on this key instead of reading
 * `process.env` directly, which keeps configuration injectable and testable.
 */
export class ConfigService extends Context.Service<ConfigService, AppConfig>()('ConfigService') {}

/**
 * Loads configuration from the ambient `ConfigProvider` (environment variables
 * by default) exactly once per runtime.
 */
export const ConfigLayer: Layer.Layer<ConfigService, Config.ConfigError> = Layer.effect(
  ConfigService,
  schema
)
