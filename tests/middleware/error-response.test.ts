import { Effect, Layer, Logger, Schema } from 'effect'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { afterAll, expect, it } from 'vite-plus/test'
import { errorResponseMiddleware } from '#/middleware/error-response.ts'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { testConfig } from '../fixtures/config.ts'
import { testServices } from '../fixtures/users.ts'

const lines: Array<string> = []
const capture = Logger.layer([Logger.make((options) => lines.push(String(options.message)))])

let schemaError: Schema.SchemaError
try {
  Schema.decodeUnknownSync(Schema.Number)('nope')
  throw new Error('unreachable')
} catch (error) {
  schemaError = error as Schema.SchemaError
}
// A real SchemaError carries the formatted issue tree the body exposes.
const decodeDefect = new HttpApiError.HttpApiSchemaError({ kind: 'Payload', cause: schemaError })

// A dying route under /api and one outside it, so the scope stays observable.
const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add('GET', '/api/boom', Effect.die(new Error('exploded')))
    yield* router.add('GET', '/boom', Effect.die(new Error('exploded')))
    yield* router.add('GET', '/api/decode', Effect.die(decodeDefect))
  })
)

const { handler, dispose } = HttpRouter.toWebHandler(
  // The merge order mirrors the serve composition: the error-body middleware
  // sits before the request log, so the log still warns about the raw
  // failure while the response carries the JSON body.
  Layer.mergeAll(
    routes,
    errorResponseMiddleware as Layer.Layer<any>,
    requestLogMiddleware() as Layer.Layer<any>
  ).pipe(
    Layer.provide(testServices),
    Layer.provide(testConfig),
    Layer.provide(HttpServer.layerServices),
    (app) => Layer.mergeAll(app, capture)
  ),
  { disableLogger: true }
)

afterAll(() => void dispose())

it('answers a defect under /api with a JSON internal error envelope', async () => {
  const response = await handler(new Request('http://localhost/api/boom'))
  expect(response.status).toBe(500)
  expect(response.headers.get('content-type')).toContain('application/json')
  const body = await response.json()
  expect(body.status).toBe('error')
  expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: false })
})

it('still lets the request log warn about the raw failure', () => {
  expect(lines.some((line) => line.includes('GET /api/boom error'))).toBe(true)
})

it('reshapes a decode failure into a 400 error envelope with the failing kind', async () => {
  const response = await handler(new Request('http://localhost/api/decode'))
  expect(response.status).toBe(400)
  const body = await response.json()
  expect(body.status).toBe('error')
  expect(body.error).toMatchObject({
    code: 'VALIDATION_FAILED',
    retryable: false,
    details: { kind: 'Payload', issue: expect.stringContaining('Expected') }
  })
})

it('leaves defects outside /api untouched', async () => {
  const response = await handler(new Request('http://localhost/boom'))
  expect(response.status).toBe(500)
  expect(await response.text()).toBe('')
})
