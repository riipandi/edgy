import { Effect, Exit, FileSystem, Logger, Path, Scope } from 'effect'
import type { Duration } from 'effect'

/** How often a new log file is started. All periods are measured in UTC. */
export type LogRotation = 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface LogFileOptions {
  /**
   * Base path, e.g. `./storage/logs/edgy.jsonl`. The file actually written is
   * named after the period it covers: `edgy_20261015.jsonl` (daily).
   */
  readonly path: string
  readonly rotation: LogRotation
  /** Log files kept, the current one included; older ones are deleted. `0` keeps all. */
  readonly maxFiles: number
}

/** A formatted line and the instant it was logged, which decides its file. */
export interface LogEntry {
  readonly at: number
  readonly line: string
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

/**
 * The period a timestamp falls in, as the part of a file name that follows the
 * underscore: `YYYYMMDD_hh` (hourly), `YYYYMMDD` (daily), `YYYYMMDD` of the
 * week's Monday (weekly), `YYYYMM` (monthly). UTC, so the same instant maps to the
 * same file on every host, and equal to the `timestamp` inside each JSON line.
 */
export const rotationStamp = (at: number, rotation: LogRotation): string => {
  const date = new Date(at)
  const year = pad(date.getUTCFullYear(), 4)
  const month = pad(date.getUTCMonth() + 1)
  const day = pad(date.getUTCDate())

  switch (rotation) {
    case 'hourly':
      return `${year}${month}${day}_${pad(date.getUTCHours())}`
    case 'daily':
      return `${year}${month}${day}`
    case 'monthly':
      return `${year}${month}`
    case 'weekly': {
      const sinceMonday = (date.getUTCDay() + 6) % 7
      const monday = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday)
      )
      return `${pad(monday.getUTCFullYear(), 4)}${pad(monday.getUTCMonth() + 1)}${pad(monday.getUTCDate())}`
    }
    default:
      return rotation satisfies never
  }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Writes entries to the file of their period, switching files when the period
 * changes and pruning old ones.
 *
 * - The file is chosen by each entry's own timestamp, so a batch that straddles
 *   midnight is split across the two files instead of landing in one.
 * - One handle is kept open; a new period closes it and opens the next file in
 *   append mode, so a restart inside the same period continues the same file.
 * - Pruning runs when a new file is opened and only touches files that match
 *   `<stem>_<stamp><ext>` in the same directory (`edgy_20261015.jsonl`), never
 *   anything else that happens to live there.
 * - Closing the handle is registered as a finalizer of the surrounding scope.
 */
export const makeRotatingFile = (options: LogFileOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const paths = yield* Path.Path

    const directory = paths.dirname(options.path)
    const extension = paths.extname(options.path)
    const stem = paths.basename(options.path, extension)
    const ours = new RegExp(
      `^${escapeRegExp(stem)}_\\d{6}(?:\\d{2}(?:_\\d{2})?)?${escapeRegExp(extension)}$`
    )
    const encoder = new TextEncoder()

    yield* fs.makeDirectory(directory, { recursive: true })

    interface Current {
      readonly stamp: string
      readonly file: FileSystem.File
      readonly scope: Scope.Closeable
    }
    let current: Current | undefined

    const closeCurrent = Effect.suspend(() => {
      const open = current
      current = undefined
      return open === undefined ? Effect.void : Scope.close(open.scope, Exit.void)
    })
    yield* Effect.addFinalizer(() => closeCurrent)

    const prune = (keep: string) =>
      Effect.gen(function* () {
        if (options.maxFiles <= 0) return
        const names = (yield* fs.readDirectory(directory)).filter((name) => ours.test(name))
        // Stamps sort chronologically as text, so the newest names come last.
        const stale = names.sort().slice(0, Math.max(0, names.length - options.maxFiles))
        for (const name of stale) {
          if (name !== keep) yield* fs.remove(paths.join(directory, name))
        }
      })

    const fileFor = (stamp: string) =>
      Effect.gen(function* () {
        if (current?.stamp === stamp) return current.file

        yield* closeCurrent
        const name = `${stem}_${stamp}${extension}`
        const scope = yield* Scope.make()
        const file = yield* fs
          .open(paths.join(directory, name), { flag: 'a+' })
          .pipe(Scope.provide(scope))
        current = { stamp, file, scope }
        // A failed prune must not lose the log lines being written.
        yield* prune(name).pipe(Effect.ignore)
        return file
      })

    const write = (entries: ReadonlyArray<LogEntry>) =>
      Effect.gen(function* () {
        // Consecutive entries of one period are written together, in order.
        let index = 0
        while (index < entries.length) {
          const stamp = rotationStamp(entries[index]?.at ?? 0, options.rotation)
          const lines: string[] = []
          while (index < entries.length) {
            const entry = entries[index]
            if (entry === undefined || rotationStamp(entry.at, options.rotation) !== stamp) break
            lines.push(entry.line)
            index += 1
          }
          const file = yield* fileFor(stamp)
          yield* file.writeAll(encoder.encode(`${lines.join('\n')}\n`))
        }
      })

    return { write }
  })

/**
 * The file sink: JSON lines, batched like the console sink, written through
 * {@link makeRotatingFile}. The batcher's own finalizer flushes what is buffered
 * and runs *before* the file is closed, because the file's finalizer is
 * registered first and finalizers run in reverse order.
 *
 * A failed write is reported on stderr and the lines of that batch are dropped:
 * logging must not take the server down, and the failure is not silent.
 */
export const makeFileSink = (options: LogFileOptions & { readonly window: Duration.Input }) =>
  Effect.gen(function* () {
    const writer = yield* makeRotatingFile(options)

    const entries = Logger.make<unknown, LogEntry>((entry) => ({
      at: entry.date.getTime(),
      line: Logger.formatJson.log(entry)
    }))

    return yield* Logger.batched(entries, {
      window: options.window,
      flush: (batch) =>
        writer.write(batch).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              process.stderr.write(`log file write failed: ${error.message}\n`)
            })
          )
        )
    })
  })
