import { Effect, Exit, FileSystem, Logger, Path, Scope } from 'effect'
import type { Duration } from 'effect'
import { jsonLogger } from './log-json.ts'
import { withinBudget } from './log-utils.ts'

export type LogRotation = 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface LogFileOptions {
  readonly path: string
  readonly rotation: LogRotation
  readonly maxFiles: number
}

interface LogEntry {
  readonly at: number
  readonly line: string
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

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
        yield* prune(name).pipe(Effect.ignore)
        return file
      })

    const write = (entries: ReadonlyArray<LogEntry>) =>
      Effect.gen(function* () {
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

export const makeFileSink = (options: LogFileOptions & { readonly window: Duration.Input }) =>
  Effect.gen(function* () {
    const writer = yield* makeRotatingFile(options)
    const entries = Logger.make<unknown, LogEntry>((entry) => ({
      at: entry.date.getTime(),
      line: jsonLogger.log(entry)
    }))

    return yield* Logger.batched(entries, {
      window: options.window,
      flush: (batch) =>
        withinBudget(
          'file',
          writer.write(batch).pipe(
            Effect.catch((error) =>
              Effect.sync(() => {
                process.stderr.write(`log file write failed: ${error.message}\n`)
              })
            )
          )
        )
    })
  })
