import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Cause, ConfigProvider, Effect, Layer, Logger, ManagedRuntime } from 'effect'
import { TestClock } from 'effect/testing'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigLayer } from '../kernel/config/service.ts'
import { jsonLogger } from './log_json.ts'
import { LoggerLayer, renderPretty } from './logger.ts'
import { TelemetryRuntimeLayer } from './telemetry.ts'

const entry = (message: string, annotations: Record<string, unknown>) =>
  ({
    timestamp: '2026-10-15T15:44:18.339Z',
    level: 'INFO',
    message,
    annotations,
    spans: {},
    fiberId: '#1',
    cause: undefined
  }) as Parameters<typeof renderPretty>[0]

describe('renderPretty', () => {
  it('prints the request line once, keeping only what the message does not say', () => {
    const line = renderPretty(
      entry('GET /api/users 200 0.49ms', {
        requestId: 'req_01abc',
        method: 'GET',
        path: '/api/users',
        status: 200,
        durationMs: 0.49
      }),
      false
    )
    expect(line).toBe('15:44:18.339 INFO  GET /api/users 200 0.49ms requestId=req_01abc')
  })

  it('keeps an annotation the message does not contain', () => {
    const line = renderPretty(entry('select "id" from "users"', { durationMs: 0.03 }), false)
    expect(line).toBe('15:44:18.339 INFO  select "id" from "users" durationMs=0.03')
  })

  it('drops a one-character value that is a whole word of the message', () => {
    const line = renderPretty(entry('GET / 200 0.05ms', { path: '/' }), false)
    expect(line).toBe('15:44:18.339 INFO  GET / 200 0.05ms')
  })

  it('does not match a value inside a longer word or number', () => {
    const line = renderPretty(entry('Applied 12 migrations', { count: 1 }), false)
    expect(line).toContain('count=1')
  })
})

describe('JSON key order', () => {
  const capture = async (program: Effect.Effect<void>): Promise<Record<string, unknown>> => {
    const lines: string[] = []
    const sink = Logger.map(jsonLogger, (line) => {
      lines.push(line)
    })
    const runtime = ManagedRuntime.make(Logger.layer([sink]))
    await runtime.runPromise(program)
    await runtime.dispose()
    return JSON.parse(lines[0] ?? '{}')
  }

  it('starts with timestamp and level, then message and annotations', async () => {
    const record = await capture(
      Effect.logInfo('hello').pipe(Effect.annotateLogs({ requestId: 'req_1' }))
    )
    expect(Object.keys(record)).toEqual([
      'timestamp',
      'level',
      'message',
      'annotations',
      'spans',
      'fiberId'
    ])
  })

  it('places the cause after the annotations, only when there is one', async () => {
    const record = await capture(Effect.logError('failed', Cause.fail('boom')))
    expect(Object.keys(record)).toEqual([
      'timestamp',
      'level',
      'message',
      'annotations',
      'cause',
      'spans',
      'fiberId'
    ])
  })
})

describe('file transport', () => {
  const run = async (env: Record<string, string>, file: string) => {
    const core = LoggerLayer.pipe(
      Layer.provide(Layer.mergeAll(NodeServices.layer, TelemetryRuntimeLayer)),
      Layer.provideMerge(ConfigLayer),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnvRecord({ OTEL_SDK_DISABLED: 'true', ...env, LOG_FILE: file })
        )
      )
    )
    const runtime = ManagedRuntime.make(core)
    await runtime.runPromise(
      Effect.logInfo('hello file').pipe(Effect.annotateLogs({ requestId: 'req_1', status: 200 }))
    )
    // Disposing closes the scope, which is what flushes the batched file sink.
    await runtime.dispose()
  }

  it('appends one JSON object per line to the file of the current period', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edgy-log-'))

    await run({ LOG_TRANSPORT: 'file', LOG_ROTATION: 'monthly' }, join(dir, 'nested', 'app.jsonl'))
    await run({ LOG_TRANSPORT: 'file', LOG_ROTATION: 'monthly' }, join(dir, 'nested', 'app.jsonl'))

    const [name, ...rest] = readdirSync(join(dir, 'nested'))
    expect(rest).toEqual([])
    expect(name).toMatch(/^app_\d{6}\.jsonl$/)

    const lines = readFileSync(join(dir, 'nested', name ?? ''), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
    const record = JSON.parse(lines[0] ?? '')
    expect(record).toMatchObject({
      message: 'hello file',
      level: 'INFO',
      annotations: { requestId: 'req_1', status: 200 }
    })
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes nothing to the file unless the transport asks for it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edgy-log-'))

    await run({ LOG_TRANSPORT: 'console', LOG_LEVEL: 'None' }, join(dir, 'app.jsonl'))

    expect(existsSync(dir) && readdirSync(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('file rotation through the logger', () => {
  it('starts a new file when the clock crosses a boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edgy-log-'))
    const core = LoggerLayer.pipe(
      Layer.provide(Layer.mergeAll(NodeServices.layer, TelemetryRuntimeLayer)),
      Layer.provideMerge(ConfigLayer),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnvRecord({
            OTEL_SDK_DISABLED: 'true',
            LOG_TRANSPORT: 'file',
            LOG_ROTATION: 'daily',
            LOG_FILE: join(dir, 'edgy.jsonl')
          })
        )
      ),
      Layer.merge(TestClock.layer())
    )
    const runtime = ManagedRuntime.make(core)

    await runtime.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse('2026-10-15T23:59:59Z'))
        yield* Effect.logInfo('before midnight')
        yield* TestClock.adjust('2 seconds')
        yield* Effect.logInfo('after midnight')
      })
    )
    await runtime.dispose()

    expect(readdirSync(dir).sort()).toEqual(['edgy_20261015.jsonl', 'edgy_20261016.jsonl'])
    expect(readFileSync(join(dir, 'edgy_20261015.jsonl'), 'utf8')).toContain('before midnight')
    expect(readFileSync(join(dir, 'edgy_20261016.jsonl'), 'utf8')).toContain('after midnight')
    rmSync(dir, { recursive: true, force: true })
  })
})
