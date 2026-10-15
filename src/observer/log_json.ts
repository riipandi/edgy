import { Formatter, Logger } from 'effect'

/**
 * JSON-lines formatter with a fixed key order: `timestamp`, `level`, `message`,
 * `annotations`, `cause` (only when present), `spans`, `fiberId`.
 *
 * Effect's own `Logger.formatJson` serialises the same fields but starts with
 * `message`, so a line begins with whatever text was logged. Putting the timestamp
 * and level first makes files sort, scan and `cut` predictably, and lets a person
 * reading `tail -f` find the time at a fixed column. Used by the file sink and by
 * `LOG_FORMAT=json`, so both emit the same shape.
 */
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
