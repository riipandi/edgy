import {
  choice,
  choiceList,
  group,
  int,
  logLevel,
  milliseconds,
  text,
  type ValueOf
} from './field.ts'

/** Logging: severity, format and how often buffered lines are written. */
export const loggingConfig = group(
  {
    level: logLevel(
      'LOG_LEVEL',
      'Info',
      'Minimum severity emitted (case-sensitive; Trace also prints SQL)'
    ),
    transport: choiceList(
      'LOG_TRANSPORT',
      ['console', 'file', 'otlp'],
      ['console'],
      'Where logs go: any of console, file, otlp, comma-separated. otlp needs telemetry on (OTEL_SDK_DISABLED not true). Workers use the console and otlp only'
    ),
    file: text(
      'LOG_FILE',
      './storage/logs/edgy.jsonl',
      'Base path of the JSON-lines log; the file written carries the period, e.g. edgy_20261015.jsonl'
    ),
    rotation: choice(
      'LOG_ROTATION',
      ['hourly', 'daily', 'weekly', 'monthly'],
      'daily',
      'How often a new log file starts (UTC): edgy_YYYYMMDD_hh, edgy_YYYYMMDD, edgy_YYYYMMDD (Monday), edgy_YYYYMM'
    ),
    fileMaxFiles: int(
      'LOG_FILE_MAX_FILES',
      14,
      'Log files kept, the current one included; older ones are deleted. 0 keeps every file'
    ),
    format: choice(
      'LOG_FORMAT',
      ['pretty', 'json'],
      'pretty',
      'Console format: human-readable lines, or one JSON object per line (the file is always JSON)'
    ),
    flushInterval: milliseconds(
      'LOG_FLUSH_INTERVAL',
      250,
      'How long log lines are buffered before one batched write to stdout',
      { min: 1 }
    )
  },
  { title: 'Logging' }
)

export type LoggingConfig = ValueOf<typeof loggingConfig>
export type LogFormat = LoggingConfig['format']
