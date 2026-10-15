import { Config, Duration } from 'effect'

/**
 * HTTP server settings: where it listens and the limits it enforces per
 * request. Variables: `HOST`, `PORT`, `BODY_LIMIT`, `REQUEST_TIMEOUT`,
 * `SHUTDOWN_TIMEOUT`.
 */
export const serverConfig = Config.all({
  host: Config.String('HOST').pipe(Config.withDefault('0.0.0.0')),
  port: Config.Port('PORT').pipe(Config.withDefault(3000)),
  /** Largest accepted request body, in bytes; larger bodies are answered with 413. */
  bodyLimit: Config.Int('BODY_LIMIT').pipe(Config.withDefault(1_048_576)),
  /** A request program that runs longer than this is interrupted and answered with 504. */
  requestTimeout: Config.Duration('REQUEST_TIMEOUT').pipe(Config.withDefault(Duration.seconds(30))),
  /** How long a graceful shutdown waits for in-flight requests before closing them. */
  shutdownTimeout: Config.Duration('SHUTDOWN_TIMEOUT').pipe(
    Config.withDefault(Duration.seconds(10))
  )
})

export type ServerConfig = Config.Success<typeof serverConfig>
