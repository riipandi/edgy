import { choice, duration, group, logLevel, type ValueOf } from './field.ts'

/** Logging: severity, format and how often buffered lines are written. */
export const loggingConfig = group(
  {
    level: logLevel(
      'LOG_LEVEL',
      'Info',
      'Minimum severity emitted (case-sensitive; Trace also prints SQL)'
    ),
    format: choice(
      'LOG_FORMAT',
      ['pretty', 'json'],
      'pretty',
      'Human-readable lines, or one JSON object per line'
    ),
    flushInterval: duration(
      'LOG_FLUSH_INTERVAL',
      '250 millis',
      'How long log lines are buffered before one batched write to stdout'
    )
  },
  { title: 'Logging' }
)

export type LoggingConfig = ValueOf<typeof loggingConfig>
export type LogFormat = LoggingConfig['format']
