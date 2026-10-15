import { type Duration, Effect, Layer, Logger, References } from 'effect'
import { ConfigService, type LogFormat } from '../kernel/config.ts'

type StructuredEntry =
  typeof Logger.formatStructured extends Logger.Logger<unknown, infer Output> ? Output : never

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m'
} as const

const levelColor = (level: string): string => {
  switch (level) {
    case 'FATAL':
    case 'ERROR':
      return ANSI.red
    case 'WARN':
      return ANSI.yellow
    case 'INFO':
      return ANSI.green
    case 'DEBUG':
      return ANSI.blue
    default:
      return ANSI.magenta
  }
}

const formatValue = (value: unknown): string =>
  typeof value === 'string' && !/[\s="]/.test(value) ? value : JSON.stringify(value)

/**
 * Renders a structured entry as `HH:MM:SS.mmm LEVEL message key=value …`,
 * followed by the pretty-printed cause when the entry carries one.
 */
const renderPretty = (entry: StructuredEntry, colors: boolean): string => {
  const paint = (text: string, color: string) => (colors ? `${color}${text}${ANSI.reset}` : text)

  const message = Array.isArray(entry.message)
    ? entry.message.map((part) => (typeof part === 'string' ? part : formatValue(part))).join(' ')
    : typeof entry.message === 'string'
      ? entry.message
      : formatValue(entry.message)

  const fields = Object.entries(entry.annotations)
    .map(([key, value]) => `${paint(`${key}=`, ANSI.dim)}${formatValue(value)}`)
    .join(' ')

  const time = paint(entry.timestamp.slice(11, 23), ANSI.dim)
  const level = paint(entry.level.padEnd(5), levelColor(entry.level))
  const head = `${time} ${level} ${message}${fields === '' ? '' : ` ${fields}`}`

  return entry.cause === undefined ? head : `${head}\n${entry.cause}`
}

/**
 * Pure formatter selection. Kept separate from the sink so formats stay
 * testable without touching stdout.
 */
const makeFormatter = (format: LogFormat, colors: boolean): Logger.Logger<unknown, string> =>
  format === 'json'
    ? Logger.formatJson
    : Logger.map(Logger.formatStructured, (entry) => renderPretty(entry, colors))

/**
 * Non-blocking log sink.
 *
 * Formatting happens on the calling fiber (cheap, no I/O); the resulting line
 * only lands in an in-memory buffer. A detached fiber drains the buffer once
 * per `window` with a **single** `stdout.write`, so no request ever waits on
 * the terminal or a pipe, and a burst of N lines costs one syscall instead of N.
 *
 * The scope finalizer flushes whatever is still buffered, so a graceful
 * shutdown (`SIGINT`/`SIGTERM` through `NodeRuntime.runMain`) loses nothing.
 * A hard crash can lose at most the last `window` of lines — the price of
 * keeping I/O off the hot path.
 */
const makeBatchedStdout = (formatter: Logger.Logger<unknown, string>, window: Duration.Input) =>
  Logger.batched(formatter, {
    window,
    flush: (lines) =>
      Effect.sync(() => {
        process.stdout.write(`${lines.join('\n')}\n`)
      })
  })

/**
 * Logger and minimum log level, derived from configuration.
 *
 * Reading `ConfigService` here applies `LOG_LEVEL`, `LOG_FORMAT` and
 * `LOG_FLUSH_INTERVAL` once for the whole process, so CLI commands and the
 * HTTP server share identical output. Replaces Effect's default console
 * logger rather than merging with it, which would double every line.
 */
export const LoggerLayer: Layer.Layer<never, never, ConfigService> = Layer.unwrap(
  Effect.gen(function* () {
    const { logLevel, logFormat, logFlushInterval } = yield* ConfigService
    const colors = process.stdout.isTTY && process.env.NO_COLOR === undefined
    const sink = makeBatchedStdout(makeFormatter(logFormat, colors), logFlushInterval)

    return Layer.merge(Logger.layer([sink]), Layer.succeed(References.MinimumLogLevel, logLevel))
  })
)
