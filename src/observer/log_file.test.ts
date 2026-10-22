import { NodeServices } from '@effect/platform-node'
import { it } from '@effect/vitest'
import { Effect, Logger } from 'effect'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect } from 'vite-plus/test'
import { makeFileSink, rotationStamp } from './log_file.ts'

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
        yield* Effect.logInfo('file record').pipe(
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
      message: 'file record',
      annotations: { requestId: 'req_1' }
    })
  }).pipe(Effect.ensuring(Effect.sync(() => rmSync(directory, { recursive: true, force: true }))))
})
