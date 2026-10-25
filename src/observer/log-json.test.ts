import { Effect, Layer, Logger, References } from 'effect'
import { expect, it } from 'vite-plus/test'
import { jsonLogger } from './log-json.ts'

it('emits a parseable structured record', async () => {
  const lines: Array<string> = []
  const sink = Logger.map(jsonLogger, (line) => lines.push(line))
  await Effect.runPromise(
    Effect.log('json probe').pipe(
      Effect.annotateLogs({ requestId: 'req_9' }),
      Effect.provide(Logger.layer([sink as Logger.Logger<unknown, unknown>])),
      Effect.provide(Layer.succeed(References.MinimumLogLevel, 'Info'))
    )
  )

  expect(lines).toHaveLength(1)
  expect(JSON.parse(lines[0]!)).toMatchObject({
    level: 'INFO',
    message: 'json probe',
    annotations: { requestId: 'req_9' },
    fiberId: expect.any(String)
  })
})
