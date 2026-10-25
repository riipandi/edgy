import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { rateLimitMiddleware } from '#/middleware/rate-limit.ts'
import { config as baseAppConfig } from '../fixtures/config.ts'
import { migratedDatabaseFor } from '../fixtures/database.ts'

// A database of its own so counters never inherit bumps from the other suites.
const database = migratedDatabaseFor('middleware-rate-limit.db')

const configLayer = (security: Partial<AppConfigShape['security']>): Layer.Layer<AppConfig> =>
  Layer.succeed(AppConfig, {
    ...baseAppConfig,
    security: { ...baseAppConfig.security, ...security }
  })

const serveWith = (security: Partial<AppConfigShape['security']>) =>
  HttpRouter.toWebHandler(
    // The limiter is route-scoped: it must be provided INTO the route layer,
    // exactly as the api composition does.
    HttpRouter.add('GET', '/api/ok', HttpServerResponse.text('ok')).pipe(
      Layer.provide(rateLimitMiddleware),
      Layer.provide(configLayer(security)),
      Layer.provide(database),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )

afterAll(() => void database)

describe('rate limit middleware', () => {
  it('counts requests, exposes the headers, and rejects past the max', async () => {
    const { handler, dispose } = serveWith({ rateLimitMax: 2 })
    try {
      const first = await handler(new Request('http://localhost/api/ok'))
      expect(first.status).toBe(200)
      expect(first.headers.get('ratelimit-limit')).toBe('2')
      expect(first.headers.get('ratelimit-remaining')).toBe('1')
      expect(Number(first.headers.get('ratelimit-reset'))).toBeGreaterThanOrEqual(1)

      const second = await handler(new Request('http://localhost/api/ok'))
      expect(second.headers.get('ratelimit-remaining')).toBe('0')

      const rejected = await handler(new Request('http://localhost/api/ok'))
      expect(rejected.status).toBe(429)
      expect(await rejected.text()).toBe('Too Many Requests')
      expect(Number(rejected.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
    } finally {
      await dispose()
    }
  })

  it('adds no limiter headers when disabled', async () => {
    const { handler, dispose } = serveWith({ rateLimitEnabled: false })
    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await handler(new Request('http://localhost/api/ok'))
        expect(response.status).toBe(200)
        expect(response.headers.get('ratelimit-limit')).toBeNull()
      }
    } finally {
      await dispose()
    }
  })
})
