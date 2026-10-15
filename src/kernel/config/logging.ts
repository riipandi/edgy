import { Config, Duration } from 'effect'

/**
 * Logging settings. Variables: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_FLUSH_INTERVAL`.
 *
 * `LOG_LEVEL` accepts Effect's level names (`All`, `Fatal`, `Error`, `Warn`,
 * `Info`, `Debug`, `Trace`, `None`) and is case-sensitive. `LOG_FORMAT` is
 * `pretty` (human-readable lines) or `json` (one object per line);
 * `LOG_FLUSH_INTERVAL` is a duration such as `250 millis`.
 */
export const loggingConfig = Config.all({
  /** Minimum severity emitted by the Effect logger. */
  level: Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info')),
  format: Config.Literals(['pretty', 'json'], 'LOG_FORMAT').pipe(Config.withDefault('pretty')),
  /** How long log lines are buffered before a single batched write to stdout. */
  flushInterval: Config.Duration('LOG_FLUSH_INTERVAL').pipe(
    Config.withDefault(Duration.millis(250))
  )
})

export type LoggingConfig = Config.Success<typeof loggingConfig>
export type LogFormat = LoggingConfig['format']
