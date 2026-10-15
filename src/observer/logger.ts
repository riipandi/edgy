import {
  type Duration,
  Effect,
  FileSystem,
  Layer,
  Logger,
  Path,
  type PlatformError,
  References
} from 'effect'
import type { HttpClient } from 'effect/http'
import type { OtlpExporter, OtlpSerialization } from 'effect/observability'
import { ConfigService, type LogFormat } from '../kernel/config/service.ts'
import { withinBudget } from './flush.ts'
import { makeFileSink } from './log_file.ts'
import { jsonLogger } from './log_json.ts'
import { makeOtlpLogSink } from './telemetry.ts'

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
 * Whether the message already states this annotation's value, so printing `key=value` would
 * only repeat it. The request line carries `GET / 200 0.49ms` as its message and `method`,
 * `path`, `status` and `durationMs` as annotations. Only the value is compared, as a whole word
 * optionally followed by a unit (`0.49` in `0.49ms`), so `1` is not found inside `12`.
 */
const repeatsMessage = (message: string, value: unknown): boolean => {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  if (text === '') return false
  return message
    .split(/\s+/)
    .some(
      (word) =>
        word === text || (word.startsWith(text) && /^[a-z%]+$/i.test(word.slice(text.length)))
    )
}

/**
 * Renders a structured entry as `HH:MM:SS.mmm LEVEL message key=value …`, followed by the
 * cause when present. Annotations the message already states are omitted; JSON keeps them all.
 */
export const renderPretty = (entry: StructuredEntry, colors: boolean): string => {
  const paint = (text: string, color: string) => (colors ? `${color}${text}${ANSI.reset}` : text)

  const message = Array.isArray(entry.message)
    ? entry.message.map((part) => (typeof part === 'string' ? part : formatValue(part))).join(' ')
    : typeof entry.message === 'string'
      ? entry.message
      : formatValue(entry.message)

  const fields = Object.entries(entry.annotations)
    .filter(([, value]) => !repeatsMessage(message, value))
    .map(([key, value]) => `${paint(`${key}=`, ANSI.dim)}${formatValue(value)}`)
    .join(' ')

  const time = paint(entry.timestamp.slice(11, 23), ANSI.dim)
  const level = paint(entry.level.padEnd(5), levelColor(entry.level))
  const head = `${time} ${level} ${message}${fields === '' ? '' : ` ${fields}`}`

  return entry.cause === undefined ? head : `${head}\n${entry.cause}`
}

/** Formatter selection, kept apart from the sink so formats are testable without stdout. */
const makeFormatter = (format: LogFormat, colors: boolean): Logger.Logger<unknown, string> =>
  format === 'json'
    ? jsonLogger
    : Logger.map(Logger.formatStructured, (entry) => renderPretty(entry, colors))

/**
 * Non-blocking log sink. Formatting runs on the calling fiber (cheap, no I/O) and the line lands
 * in an in-memory buffer. A detached fiber drains the buffer once per `window` with a single
 * `stdout.write`, so no request waits on the terminal or a pipe, and a burst of N lines costs
 * one syscall.
 *
 * The scope finalizer flushes what is still buffered, so a graceful shutdown (SIGINT/SIGTERM)
 * loses nothing. A hard crash can lose the last `window` of lines.
 */
const makeBatchedStdout = (formatter: Logger.Logger<unknown, string>, window: Duration.Input) =>
  Logger.batched(formatter, {
    window,
    // Resume only once Node has flushed the write: a process that exits right after would cut
    // the last batch on a full pipe.
    flush: (lines) =>
      withinBudget(
        'stdout',
        Effect.callback<void>((resume) => {
          process.stdout.write(`${lines.join('\n')}\n`, () => resume(Effect.void))
        })
      )
  })

/**
 * Logger and minimum log level, derived from configuration. It applies the `LOG_*` settings once
 * per process, so CLI commands and the HTTP server print identical output.
 *
 * `LOG_TRANSPORT` selects the sinks (batched stdout, the rotating JSON file sink, or both), and
 * each receives every line. It replaces Effect's default console logger rather than merging with
 * it, which would double every line.
 */
export const LoggerLayer: Layer.Layer<
  never,
  PlatformError.PlatformError,
  | ConfigService
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | OtlpSerialization.OtlpSerialization
  | OtlpExporter.Flusher
> = Layer.unwrap(
  Effect.gen(function* () {
    const { logging } = yield* ConfigService
    const colors = process.stdout.isTTY && process.env.NO_COLOR === undefined

    const sinks = [
      ...(logging.transport.includes('console')
        ? [makeBatchedStdout(makeFormatter(logging.format, colors), logging.flushInterval)]
        : []),
      ...(logging.transport.includes('file')
        ? [
            makeFileSink({
              path: logging.file,
              rotation: logging.rotation,
              maxFiles: logging.fileMaxFiles,
              window: logging.flushInterval
            })
          ]
        : []),
      ...(logging.transport.includes('otlp') ? [makeOtlpLogSink] : [])
    ]

    return Layer.merge(
      Logger.layer(sinks),
      Layer.succeed(References.MinimumLogLevel, logging.level)
    )
  })
)

/**
 * Logger for Workers. There is no buffer and no stdout: a Worker has no shutdown hook to flush
 * on, and `console.log` is already asynchronous, so each line goes straight out. Same formatter
 * and level, without ANSI colours.
 */
export const ConsoleLoggerLayer: Layer.Layer<
  never,
  never,
  ConfigService | HttpClient.HttpClient | OtlpSerialization.OtlpSerialization | OtlpExporter.Flusher
> = Layer.unwrap(
  Effect.gen(function* () {
    const { logging } = yield* ConfigService
    const consoleSink = Logger.map(makeFormatter(logging.format, false), (line) => {
      console.log(line)
    })

    // `file` has no meaning on a Worker; with nothing else selected, log to the console.
    const wantsOtlp = logging.transport.includes('otlp')
    const wantsConsole = logging.transport.includes('console') || !wantsOtlp
    const sinks = [...(wantsConsole ? [consoleSink] : []), ...(wantsOtlp ? [makeOtlpLogSink] : [])]

    return Layer.merge(
      Logger.layer(sinks),
      Layer.succeed(References.MinimumLogLevel, logging.level)
    )
  })
)
