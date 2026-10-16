import { Formatter, Logger } from 'effect'

/**
 * JSON-lines formatter with a fixed key order: `timestamp`, `level`, `message`, `annotations`,
 * `cause` (only when present), `spans`, `fiberId`.
 *
 * Effect's `Logger.formatJson` starts with `message`, so a line begins with arbitrary text.
 * Putting the timestamp and level first keeps files sortable and `cut`-able, and the time sits
 * at a fixed column under `tail -f`. Used by the file sink and by `LOG_FORMAT=json`, so both
 * emit one shape.
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
