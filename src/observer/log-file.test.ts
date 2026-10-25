import { NodeServices } from '@effect/platform-node'
import { it } from '@effect/vitest'
import { Effect, Logger } from 'effect'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect } from 'vite-plus/test'
import { makeFileSink, makeRotatingFile, rotationStamp } from './log-file.ts'

// 2026-10-21 is a Wednesday; the week starts on its Monday, 2026-10-19.
const AT = Date.UTC(2026, 9, 21, 15, 30, 45)
const HOUR = 60 * 60 * 1000

it.effect('writes structured records and flushes them before the scope closes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgy-log-'))
  const basePath = path.join(directory, 'nested', 'app.jsonl')

  return Effect.gen(function* () {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sink = yield* makeFileSink({
          path: basePath,
          rotation: 'daily',
          maxFiles: 2,
          window: '1 hour'
        })
        yield* Effect.logInfo('File record').pipe(
          Effect.annotateLogs({ requestId: 'req_1' }),
          Effect.provide(Logger.layer([sink]))
        )
      })
    ).pipe(Effect.provide(NodeServices.layer))

    const stamp = rotationStamp(0, 'daily')
    const filename = `app_${stamp}.jsonl`
    expect(readdirSync(path.dirname(basePath))).toEqual([filename])
    expect(
      JSON.parse(readFileSync(path.join(path.dirname(basePath), filename), 'utf8'))
    ).toMatchObject({
      message: 'File record',
      annotations: { requestId: 'req_1' }
    })
  }).pipe(Effect.ensuring(Effect.sync(() => rmSync(directory, { recursive: true, force: true }))))
})

it.effect('stamps each rotation period from UTC time', () =>
  Effect.gen(function* () {
    expect(rotationStamp(AT, 'hourly')).toBe('20261021_15')
    expect(rotationStamp(AT, 'daily')).toBe('20261021')
    expect(rotationStamp(AT, 'weekly')).toBe('20261019')
    expect(rotationStamp(AT, 'monthly')).toBe('202610')
  })
)

it.effect('prunes rotated files past maxFiles and never the live one', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgy-rotation-'))
  return Effect.gen(function* () {
    yield* Effect.scoped(
      Effect.flatMap(
        makeRotatingFile({
          path: path.join(directory, 'app.jsonl'),
          rotation: 'hourly',
          maxFiles: 1
        }),
        (writer) =>
          // Two writes land in different hours; the older file is pruned.
          writer.write([
            { at: AT, line: 'older' },
            { at: AT + HOUR, line: 'newer' }
          ])
      ).pipe(Effect.provide(NodeServices.layer))
    )

    expect(readdirSync(directory).sort()).toEqual(['app_20261021_16.jsonl'])
  }).pipe(Effect.ensuring(Effect.sync(() => rmSync(directory, { recursive: true, force: true }))))
})
