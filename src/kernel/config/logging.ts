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

export const loggingConfig = group(
  {
    level: logLevel('LOG_LEVEL', 'Info', 'Minimum log severity'),
    transport: choiceList('LOG_TRANSPORT', ['console', 'file', 'otlp'], ['console'], 'Log sinks'),
    file: text('LOG_FILE', 'storage/logs/app.jsonl', 'Base path for JSON-lines logs'),
    rotation: choice(
      'LOG_ROTATION',
      ['hourly', 'daily', 'weekly', 'monthly'],
      'daily',
      'Log rotation period'
    ),
    fileMaxFiles: int('LOG_FILE_MAX_FILES', 14, 'Maximum rotated log files; zero keeps all'),
    format: choice('LOG_FORMAT', ['pretty', 'json'], 'pretty', 'Console log format'),
    flushInterval: milliseconds('LOG_FLUSH_INTERVAL', 250, 'Buffered log flush interval', 1)
  },
  'Logging'
)

export type LogFormat = ValueOf<typeof loggingConfig>['format']
