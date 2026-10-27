import { Effect, Layer, Logger, Metric } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
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
  requestLogMiddleware() as Layer.Layer<any>
])

// A minimal router with a dying route plus a catch-all fallback (mirroring the
// renderer) so unmatched paths still travel through the global middleware. A
// quiet-path route that dies covers the quiet-failure row, and a route that
// never completes covers the client-disconnect row.
const lines: Array<string> = []
const capture = Logger.layer([Logger.make((options) => lines.push(String(options.message)))])
const probeRouter = (quietFailure: boolean) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      yield* router.add('GET', '/boom', Effect.die(new Error('exploded')))
      if (quietFailure) {
        yield* router.add('GET', '/favicon.ico', Effect.die(new Error('favicon exploded')))
        yield* router.add(
          'GET',
          '/disconnect',
          Effect.never as Effect.Effect<HttpServerResponse.HttpServerResponse>
        )
      }
      yield* router.add('*', '*', Effect.succeed(HttpServerResponse.empty()))
    })
  )
const probeHandler = (quietFailure: boolean) =>
  HttpRouter.toWebHandler(
    probeRouter(quietFailure).pipe(
      // The capture logger rides the top-level merge: a provided layer's
      // CurrentLoggers reference does not reach the request fibers.
      Layer.provide(requestLogMiddleware() as Layer.Layer<any>),
      Layer.provide(testConfig),
      Layer.provide(HttpServer.layerServices),
      (layer) => Layer.mergeAll(layer, capture)
    ),
    { disableLogger: true }
  )
const { handler: failingHandler, dispose: disposeFailing } = probeHandler(true)
const { handler: quietHandler, dispose: disposeQuiet } = probeHandler(false)

afterAll(() => {
  void dispose()
  void disposeFailing()
  void disposeQuiet()
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

it('stays quiet for browser, tooling, and scraper noise', async () => {
  for (const url of [
    'http://localhost/.well-known/appspecific/com.chrome.devtools.json',
    'http://localhost/favicon.ico',
    'http://localhost/assets/app-4f2a1b9c.js',
    'http://localhost/metrics'
  ]) {
    const before = lines.length
    const response = await quietHandler(new Request(url))
    expect(response.status).toBeLessThan(500)
    expect(lines.slice(before), url).toHaveLength(0)
  }

  // The devtools probe is the only quiet document under /.well-known/; other
  // discovery requests stay logged.
  const before = lines.length
  const jwks = await quietHandler(new Request('http://localhost/.well-known/jwks.json'))
  expect(jwks.status).toBeLessThan(500)
  expect(lines.slice(before)).toHaveLength(1)
  expect(lines.some((line) => line.includes('GET /.well-known/jwks.json 204'))).toBe(true)

  const loud = await failingHandler(new Request('http://localhost/boom'))
  expect(loud.status).toBe(500)
  expect(lines.some((line) => line.includes('GET /boom error'))).toBe(true)
})

it('still warns and records metrics when a quiet path fails', async () => {
  const { handler: quietFailingHandler, dispose: disposeQuietFailing } = probeHandler(true)
  const linesBefore = lines.length
  const crashedBefore = await Effect.runPromise(seriesFor('500', '/favicon.ico'))

  const response = await quietFailingHandler(new Request('http://localhost/favicon.ico'))
  expect(response.status).toBe(500)

  const warnings = lines
    .slice(linesBefore)
    .filter((line) => line.includes('GET /favicon.ico error'))
  expect(warnings).toHaveLength(1)

  const crashedAfter = await Effect.runPromise(seriesFor('500', '/favicon.ico'))
  expect(crashedAfter.count).toBeGreaterThan(crashedBefore.count)
  void disposeQuietFailing()
})

it('does not record a client disconnect as a server fault', async () => {
  const { handler: disconnectHandler, dispose: disposeDisconnect } = probeHandler(true)
  const linesBefore = lines.length
  const crashedBefore = await Effect.runPromise(seriesFor('500', '/disconnect'))

  const controller = new AbortController()
  const pending = disconnectHandler(
    new Request('http://localhost/disconnect', { signal: controller.signal })
  )
  controller.abort()
  await Promise.race([
    pending.then(
      (response) => response,
      () => undefined
    ),
    new Promise((resolve) => setTimeout(resolve, 500))
  ])
  await new Promise((resolve) => setTimeout(resolve, 200))

  expect(lines.slice(linesBefore).filter((line) => line.includes('disconnect'))).toHaveLength(0)
  const crashedAfter = await Effect.runPromise(seriesFor('500', '/disconnect'))
  expect(crashedAfter.count).toBe(crashedBefore.count)
  void disposeDisconnect()
})

it('honors custom quiet paths in place of the defaults', async () => {
  const { handler: customHandler, dispose: disposeCustom } = HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        yield* router.add('GET', '/boom', Effect.die(new Error('exploded')))
        yield* router.add('*', '*', Effect.succeed(HttpServerResponse.empty()))
      })
    ).pipe(
      Layer.provide(
        requestLogMiddleware({ quietPaths: [{ path: '/secret', exact: true }] }) as Layer.Layer<any>
      ),
      Layer.provide(testConfig),
      Layer.provide(HttpServer.layerServices),
      (layer) => Layer.mergeAll(layer, capture)
    ),
    { disableLogger: true }
  )

  const quiet = lines.length
  await customHandler(new Request('http://localhost/secret'))
  expect(lines.length).toBe(quiet)
  // Exact does not cover the subtree, and defaults are replaced, so both log.
  await customHandler(new Request('http://localhost/secret/nested'))
  expect(lines.some((line) => line.includes('GET /secret/nested'))).toBe(true)
  await customHandler(new Request('http://localhost/favicon.ico'))
  expect(lines.some((line) => line.includes('GET /favicon.ico'))).toBe(true)
  void disposeCustom()
})
