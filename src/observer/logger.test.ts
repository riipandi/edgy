import { Effect, Layer, Logger, References } from 'effect'
import { expect, it } from 'vite-plus/test'
import { renderPretty } from './logger.ts'

const prettyLines = (colors: boolean) => {
  const lines: Array<string> = []
  const sink = Logger.map(Logger.formatStructured, (entry) =>
    lines.push(renderPretty(entry, colors))
  )
  const run = (effect: Effect.Effect<void>) =>
    effect.pipe(
      Effect.provide(Logger.layer([sink as Logger.Logger<unknown, unknown>])),
      Effect.provide(Layer.succeed(References.MinimumLogLevel, 'Info'))
    )
  return { lines, run }
}

it('renders a plain line with the time, level, message, and distinct fields', async () => {
  const { lines, run } = prettyLines(false)
  await Effect.runPromise(
    run(
      Effect.log('GET /api/users 200', 42).pipe(
        Effect.annotateLogs({ route: '/api/users', status: 200, requestId: 'req_1' })
      )
    )
  )
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatch(
    /^\d{2}:\d{2}:\d{2}\.\d{3} INFO  GET \/api\/users 200 42 requestId=req_1$/
  )
})

it('paints the time dim, the level by severity, and the field names', async () => {
  const { lines, run } = prettyLines(true)
  await Effect.runPromise(
    run(Effect.log('hello world').pipe(Effect.annotateLogs({ requestId: 'req_1' })))
  )
  expect(lines[0]).toContain('\u001b[2m')
  expect(lines[0]).toContain('\u001b[32mINFO \u001b[0m')
  expect(lines[0]).toContain('\u001b[2mrequestId=\u001b[0mreq_1')
  expect(lines[0]).not.toContain('\u001b[31m')
})

it('json-stringifies non-string message parts, strings pass through raw', async () => {
  const { lines, run } = prettyLines(false)
  await Effect.runPromise(run(Effect.log('hello', 'two words', { a: 1 })))
  expect(lines[0]).toContain('hello two words {"a":1}')
})

it('appends the cause on its own line', () => {
  const entry = {
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'ERROR',
    message: 'boom',
    annotations: {},
    cause: 'Error: exploded',
    spans: {},
    fiberId: '#1'
  }
  expect(renderPretty(entry as never, false)).toBe('00:00:00.000 ERROR boom\nError: exploded')
})
