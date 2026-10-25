import { NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { OtlpExporter, OtlpSerialization } from 'effect/observability'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, expect, it } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { config as baseConfig } from '../../tests/fixtures/config.ts'
import { LoggerLayer } from './logger.ts'

const directories: Array<string> = []
const tempDir = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgy-logger-layer-'))
  directories.push(directory)
  return directory
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

const loggingConfig = (
  over: Partial<AppConfigShape['logging']>,
  directory: string
): Layer.Layer<AppConfig> =>
  Layer.succeed(AppConfig, {
    ...baseConfig,
    logging: {
      ...baseConfig.logging,
      file: path.join(directory, 'logs', 'app.jsonl'),
      ...over
    }
  })

// The layer needs the OTLP surface declared even when no transport selects it.
const loggerDeps = Layer.mergeAll(
  NodeServices.layer,
  FetchHttpClient.layer,
  OtlpSerialization.layerJson,
  OtlpExporter.layerFlusher
)

const withLogger = (over: Partial<AppConfigShape['logging']>, directory: string) => {
  const writes: Array<string> = []
  const original = process.stdout.write.bind(process)
  // The production sink resumes its flush through the write callback; the
  // stub has to invoke it or the batched flush never completes.
  process.stdout.write = ((chunk: unknown, callback?: (error?: Error) => void) => {
    writes.push(String(chunk))
    if (typeof callback === 'function') callback()
    return true
  }) as typeof process.stdout.write
  const restore = () => {
    process.stdout.write = original
  }
  const program = Effect.logInfo('layer probe').pipe(
    Effect.annotateLogs({ requestId: 'req_l' }),
    Effect.provide(
      LoggerLayer.pipe(Layer.provide(loggerDeps), Layer.provide(loggingConfig(over, directory)))
    )
  )
  return Effect.gen(function* () {
    yield* program
    restore()
    return writes
  }).pipe(
    Effect.catch(() =>
      Effect.sync(restore).pipe(Effect.flatMap(() => Effect.die('logger run failed')))
    )
  )
}

it('writes through the console and file transports from one layer build', async () => {
  const directory = tempDir()
  const writes = await Effect.runPromise(withLogger({ transport: ['console', 'file'] }, directory))
  expect(writes.join('')).toContain('layer probe')
  const files = readdirSync(path.join(directory, 'logs'))
  expect(files).toHaveLength(1)
  const record = JSON.parse(readFileSync(path.join(directory, 'logs', files[0]!), 'utf8'))
  expect(record).toMatchObject({
    message: 'layer probe',
    annotations: { requestId: 'req_l' }
  })
})

it('writes nothing to stdout when the console transport is off', async () => {
  const directory = tempDir()
  const writes = await Effect.runPromise(withLogger({ transport: ['file'] }, directory))
  expect(writes.join('')).not.toContain('layer probe')
  expect(readdirSync(path.join(directory, 'logs'))).toHaveLength(1)
})

it('emits one JSON object per record when the format is json', async () => {
  const directory = tempDir()
  const writes = await Effect.runPromise(
    withLogger({ transport: ['console'], format: 'json' }, directory)
  )
  const line = writes
    .join('')
    .split('\n')
    .find((entry) => entry.includes('layer probe'))
  expect(line).toBeDefined()
  expect(JSON.parse(line!)).toMatchObject({ message: 'layer probe', level: 'INFO' })
})

it('writes nothing when no transport is selected', async () => {
  const directory = tempDir()
  const writes = await Effect.runPromise(withLogger({ transport: [] }, directory))
  expect(writes.join('')).not.toContain('layer probe')
  // The file sink never opens, so the log directory is not even created.
  expect(() => readdirSync(path.join(directory, 'logs'))).toThrowError(/ENOENT/)
})
