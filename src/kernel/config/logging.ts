import { choice, choiceList, group, logLevel, milliseconds, text, type ValueOf } from './field.ts'

export const loggingConfig = group(
  {
    level: logLevel('LOG_LEVEL', 'Info', 'Minimum log severity'),
    transport: choiceList('LOG_TRANSPORT', ['console', 'file', 'otlp'], ['console'], 'Log sinks'),
    file: text('LOG_FILE', 'storage/logs/app.jsonl', 'Base path for JSON-lines logs'),
    format: choice('LOG_FORMAT', ['pretty', 'json'], 'pretty', 'Console log format'),
    flushInterval: milliseconds('LOG_FLUSH_INTERVAL', 250, 'Buffered log flush interval', 1)
  },
  'Logging'
)

export type LoggingConfig = ValueOf<typeof loggingConfig>
export type LogFormat = LoggingConfig['format']
