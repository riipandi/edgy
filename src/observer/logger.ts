import { Effect, FileSystem, Layer, Logger, Path, References, type PlatformError } from 'effect'
import type { Duration } from 'effect'
import type { HttpClient } from 'effect/http'
import type { OtlpExporter, OtlpSerialization } from 'effect/observability'
import { AppConfig, type LogFormat } from '#/kernel/config/config.ts'
import { makeFileSink } from './log-file.ts'
import { jsonLogger } from './log-json.ts'
import { withinBudget } from './log-utils.ts'
import { makeOtlpLogSink } from './tracing.ts'

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
  typeof value === 'string' && !/[\s="]/u.test(value) ? value : JSON.stringify(value)

const repeatsMessage = (message: string, value: unknown): boolean => {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  if (text === '') return false
  return message.split(/\s+/u).some((word) => {
    if (word === text) return true
    const suffix = word.startsWith(text) ? word.slice(text.length) : ''
    return suffix.length > 0 && /^[a-z%]+$/iu.test(suffix)
  })
}

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

const makeFormatter = (format: LogFormat, colors: boolean): Logger.Logger<unknown, string> =>
  format === 'json'
    ? jsonLogger
    : Logger.map(Logger.formatStructured, (entry) => renderPretty(entry, colors))

const makeBatchedStdout = (formatter: Logger.Logger<unknown, string>, window: Duration.Input) =>
  Logger.batched(formatter, {
    window,
    flush: (lines) =>
      withinBudget(
        'stdout',
        Effect.callback<void>((resume) => {
          process.stdout.write(`${lines.join('\n')}\n`, () => resume(Effect.void))
        })
      )
  })

export const LoggerLayer: Layer.Layer<
  never,
  PlatformError.PlatformError,
  | AppConfig
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | OtlpSerialization.OtlpSerialization
  | OtlpExporter.Flusher
> = Layer.unwrap(
  Effect.gen(function* () {
    const { logging } = yield* AppConfig
    const colors = process.stdout.isTTY && process.env['NO_COLOR'] === undefined
    const sinks: Array<Logger.Logger<unknown, unknown>> = []

    if (logging.transport.includes('console')) {
      sinks.push(
        yield* makeBatchedStdout(makeFormatter(logging.format, colors), logging.flushInterval)
      )
    }
    if (logging.transport.includes('file')) {
      sinks.push(
        yield* makeFileSink({
          path: logging.file,
          rotation: logging.rotation,
          maxFiles: logging.fileMaxFiles,
          window: logging.flushInterval
        })
      )
    }
    if (logging.transport.includes('otlp')) sinks.push(yield* makeOtlpLogSink)

    return Layer.merge(
      Logger.layer(sinks),
      Layer.succeed(References.MinimumLogLevel, logging.level)
    )
  })
)
