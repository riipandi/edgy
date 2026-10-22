import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { afterAll, expect, it } from 'vite-plus/test'
import { securityHeaders } from '#/middleware/security-headers.ts'

const { handler, dispose } = HttpRouter.toWebHandler(
  Layer.mergeAll(HttpRouter.add('GET', '/', HttpServerResponse.text('ok')), securityHeaders).pipe(
    Layer.provide(HttpServer.layerServices)
  ),
  { disableLogger: true }
)

afterAll(() => dispose())

it('sets the hardening headers on every response', async () => {
  const response = await handler(new Request('http://localhost/'))
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('x-frame-options')).toBe('DENY')
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  const csp = response.headers.get('content-security-policy') ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain('frame-ancestors')
  expect(csp).toContain('unsafe-inline')
})
