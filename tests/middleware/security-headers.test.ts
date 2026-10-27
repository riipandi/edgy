import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { afterAll, expect, it } from 'vite-plus/test'
import {
  applySecurityHeaders,
  cspFor,
  docsCspFor,
  docsSecurityHeadersMiddleware,
  securityHeadersMiddleware
} from '#/middleware/security-headers.ts'

const { handler, dispose } = HttpRouter.toWebHandler(
  Layer.mergeAll(
    HttpRouter.add('GET', '/', HttpServerResponse.text('ok')),
    securityHeadersMiddleware
  ).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: true }
)

const docs = HttpRouter.toWebHandler(
  Layer.mergeAll(
    HttpRouter.add('GET', '/docs', HttpServerResponse.html('<script>boot()</script>')).pipe(
      Layer.provide(docsSecurityHeadersMiddleware)
    ),
    HttpRouter.add('GET', '/other', HttpServerResponse.text('ok')),
    securityHeadersMiddleware
  ).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: true }
)

afterAll(() => {
  void dispose()
  void docs.dispose()
})

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

it('keeps a response CSP and still adds the hardening headers', () => {
  const withCsp = HttpServerResponse.setHeaders({
    'content-security-policy': "script-src 'self'"
  })(HttpServerResponse.empty())
  const hardened = applySecurityHeaders()(withCsp)
  expect(hardened.headers['content-security-policy']).toBe("script-src 'self'")
  expect(hardened.headers['x-content-type-options']).toBe('nosniff')
  expect(hardened.headers['x-frame-options']).toBe('DENY')
  expect(hardened.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
})

it('answers no script-src when no nonce is given', () => {
  expect(cspFor()).not.toContain('script-src')
})

it('builds a nonce CSP that keeps the strict-dynamic chain', () => {
  const csp = cspFor('nonce_01m5jtbsr4ehya4j9w1z5cjkqq')
  expect(csp).toContain("'nonce-nonce_01m5jtbsr4ehya4j9w1z5cjkqq'")
  expect(csp).toContain("'strict-dynamic'")
  expect(csp).toContain("default-src 'self'")
})

it('admits inline scripts on the docs route only', async () => {
  expect(docsCspFor()).toContain("script-src 'self' 'unsafe-inline'")

  const docResponse = await docs.handler(new Request('http://localhost/docs'))
  expect(docResponse.headers.get('content-security-policy')).toBe(docsCspFor())

  const other = await docs.handler(new Request('http://localhost/other'))
  expect(other.headers.get('content-security-policy')).not.toContain('script-src')
})
