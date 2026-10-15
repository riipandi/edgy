import { Config, Context, Layer } from 'effect'
import { corsConfig } from './cors.ts'
import { databaseConfig } from './database.ts'
import { loggingConfig } from './logging.ts'
import { serverConfig } from './server.ts'

/**
 * The whole configuration, one section per concern. A section is a file in this
 * directory that owns its environment variables, defaults and validation;
 * adding a concern means adding a file and one line here, so this file stays
 * the table of contents and never grows with the number of keys.
 *
 * Missing variables fall back to development defaults; present-but-invalid
 * values (for example a non-numeric `PORT`) fail with a typed `ConfigError`
 * while the layer is being built.
 */
const schema = Config.all({
  server: serverConfig,
  database: databaseConfig,
  logging: loggingConfig,
  cors: corsConfig
})

/** Parsed, validated application configuration. */
export type AppConfig = Config.Success<typeof schema>

/**
 * Configuration service. Consumers depend on this key instead of reading
 * `process.env` directly, which keeps configuration injectable and testable.
 * Read the section you need (`const { port } = (yield* ConfigService).server`).
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

export type { CorsConfig } from './cors.ts'
export type { DatabaseConfig } from './database.ts'
export type { LogFormat, LoggingConfig } from './logging.ts'
export type { ServerConfig } from './server.ts'
