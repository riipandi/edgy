import { Formatter, Logger } from 'effect'

export const jsonLogger: Logger.Logger<unknown, string> = Logger.map(
  Logger.formatStructured,
  (entry) =>
    Formatter.formatJson({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      annotations: entry.annotations,
      cause: entry.cause,
      spans: entry.spans,
      fiberId: entry.fiberId
    })
)
