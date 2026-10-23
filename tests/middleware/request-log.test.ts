import { Effect, Layer, Metric } from 'effect'
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

afterAll(() => dispose())

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
