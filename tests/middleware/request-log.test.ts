import { Effect, Layer, Logger, Metric } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { TypeID } from 'typeid-js'
import { afterAll, expect, it } from 'vite-plus/test'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { httpRequests } from '#/observer/metrics.ts'
import { toHandler } from '../fixtures/api.ts'
import { testConfig } from '../fixtures/config.ts'
import { testServices } from '../fixtures/users.ts'

// The composed API wrapped by the middleware, mirroring the serve command's
// router assembly.
const { handler, dispose } = toHandler(testServices, testConfig, undefined, [
  requestLogMiddleware as Layer.Layer<any>
])

// A minimal router with a dying route to exercise the failure branch of the
// middleware itself.
const lines: Array<string> = []
const capture = Logger.layer([Logger.make((options) => lines.push(String(options.message)))])
const { handler: failingHandler, dispose: disposeFailing } = HttpRouter.toWebHandler(
  // The capture logger rides the top-level merge: a provided layer's
  // CurrentLoggers reference does not reach the request fibers.
  Layer.mergeAll(
    HttpRouter.add('GET', '/boom', Effect.die(new Error('exploded'))).pipe(
      Layer.provide(requestLogMiddleware as Layer.Layer<any>),
      Layer.provide(testConfig),
      Layer.provide(HttpServer.layerServices)
    ),
    capture
  ),
  { disableLogger: true }
)

afterAll(() => {
  void dispose()
  void disposeFailing()
})

const seriesFor = (statusCode: string, route: string) =>
  Effect.gen(function* () {
    return yield* Metric.value(
      Metric.withAttributes(httpRequests, { method: 'GET', status_code: statusCode, route })
    )
  })

it('labels each series with the exact code and the matched route template', async () => {
  const listed = await handler(new Request('http://localhost/api/users'))
  expect(listed.status).toBe(200)

  const enough = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a9999').toString()
  const missing = await handler(new Request(`http://localhost/api/users/${enough}`))
  expect(missing.status).toBe(404)

  expect((await Effect.runPromise(seriesFor('200', '/api/users'))).count).toBeGreaterThanOrEqual(1)
  expect(
    (await Effect.runPromise(seriesFor('404', '/api/users/:id'))).count
  ).toBeGreaterThanOrEqual(1)
})

it('records a defect as a 500 and warns with the failing route', async () => {
  const linesBefore = lines.length
  const response = await failingHandler(new Request('http://localhost/boom'))
  expect(response.status).toBe(500)

  const crashed = await Effect.runPromise(seriesFor('500', '/boom'))
  expect(crashed.count).toBeGreaterThanOrEqual(1)

  const warnings = lines.slice(linesBefore).filter((line) => line.includes('GET /boom error'))
  expect(warnings).toHaveLength(1)
})
