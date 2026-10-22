import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { afterAll, expect, it } from 'vite-plus/test'
import { requestId, requestIdFrom } from '#/middleware/request-id.ts'

const { handler, dispose } = HttpRouter.toWebHandler(
  Layer.mergeAll(
    HttpRouter.add('GET', '/request-id', HttpServerResponse.text('ok')),
    requestId
  ).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: true }
)

afterAll(() => dispose())

it('echoes valid request ids and replaces malformed ones', async () => {
  const accepted = await handler(
    new Request('http://localhost/request-id', {
      headers: { 'x-request-id': 'req_01h455vb4pex5vsknk084sn02q' }
    })
  )
  expect(accepted.headers.get('x-request-id')).toBe('req_01h455vb4pex5vsknk084sn02q')

  const replaced = await handler(
    new Request('http://localhost/request-id', { headers: { 'x-request-id': 'bad id' } })
  )
  expect(requestIdFrom(replaced.headers.get('x-request-id') ?? '')).toBeDefined()
})
