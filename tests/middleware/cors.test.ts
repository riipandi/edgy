import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { expect, it } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { cors } from '#/middleware/cors.ts'
import { config as baseAppConfig } from '../fixtures/config.ts'

const configLayer = (security: Partial<AppConfigShape['security']>): Layer.Layer<AppConfig> =>
  Layer.succeed(AppConfig, {
    ...baseAppConfig,
    security: { ...baseAppConfig.security, ...security }
  })

const serveWith = (security: Partial<AppConfigShape['security']>) =>
  HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpRouter.add('GET', '/api/ok', HttpServerResponse.text('ok')),
      HttpRouter.add('OPTIONS', '*', HttpServerResponse.text('')),
      cors
    ).pipe(Layer.provide(configLayer(security)), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true }
  )

it('echoes any origin when the allow list is empty', async () => {
  const { handler } = serveWith({})
  const response = await handler(
    new Request('http://localhost/api/ok', { headers: { origin: 'https://app.example.com' } })
  )
  expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  expect(response.headers.get('access-control-allow-credentials')).toBe('true')
})

it('restricts origins when the allow list is set', async () => {
  const { handler } = serveWith({ corsAllowedOrigins: ['https://allowed.example.com'] })
  const allowed = await handler(
    new Request('http://localhost/api/ok', { headers: { origin: 'https://allowed.example.com' } })
  )
  expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example.com')
  const denied = await handler(
    new Request('http://localhost/api/ok', { headers: { origin: 'https://other.example.com' } })
  )
  expect(denied.headers.get('access-control-allow-origin')).toBeNull()
})

it('answers preflight requests without running the route', async () => {
  const { handler } = serveWith({})
  const response = await handler(
    new Request('http://localhost/api/ok', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'POST'
      }
    })
  )
  expect(response.status).toBe(204)
  expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  expect(await response.text()).toBe('')
})

it('adds no CORS headers when disabled', async () => {
  const { handler } = serveWith({ corsEnabled: false })
  const response = await handler(
    new Request('http://localhost/api/ok', { headers: { origin: 'https://app.example.com' } })
  )
  expect(response.headers.get('access-control-allow-origin')).toBeNull()
})
