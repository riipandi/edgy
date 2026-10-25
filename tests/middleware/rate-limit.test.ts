import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { describe, expect, it } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { rateLimitMiddleware, type RateLimitExclusion } from '#/middleware/rate-limit.ts'
import { config as baseAppConfig } from '../fixtures/config.ts'
import { migratedDatabaseFor } from '../fixtures/database.ts'

// A database per serveWith: the limiter's 'local' counter would otherwise
// leak across the tests in this file, since every request shares one key.
let databaseSuffix = 0
const serveWith = (
  security: Partial<AppConfigShape['security']>,
  options?: { excludePaths?: ReadonlyArray<RateLimitExclusion> }
) => {
  databaseSuffix += 1
  const database = migratedDatabaseFor(`middleware-rate-limit-${databaseSuffix}.db`)
  const built = HttpRouter.toWebHandler(
    // The limiter is route-scoped: it must be provided INTO the route layer,
    // exactly as the api composition does. A nested route proves whether an
    // exclusion covers just the path or its subtree.
    Layer.mergeAll(
      HttpRouter.add('GET', '/api/ok', HttpServerResponse.text('ok')),
      HttpRouter.add('GET', '/api/ok/sub', HttpServerResponse.text('sub'))
    ).pipe(
      Layer.provide(rateLimitMiddleware(options)),
      Layer.provide(
        Layer.succeed(AppConfig, {
          ...baseAppConfig,
          security: { ...baseAppConfig.security, ...security }
        })
      ),
      Layer.provide(database),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )
  return { ...built, dispose: built.dispose }
}

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

  it('leaves excluded paths unthrottled and unbilled', async () => {
    const { handler, dispose } = serveWith(
      { rateLimitMax: 2 },
      { excludePaths: [{ path: '/api/ok' }] }
    )
    try {
      // The default is a prefix match, so the subtree stays open too.
      for (const path of ['/api/ok', '/api/ok/sub']) {
        for (let index = 0; index < 4; index += 1) {
          const response = await handler(new Request(`http://localhost${path}`))
          expect(response.status).toBe(200)
          expect(response.headers.get('ratelimit-limit')).toBeNull()
        }
      }
    } finally {
      await dispose()
    }
  })

  it('limits the subtree of an exact exclusion', async () => {
    const { handler, dispose } = serveWith(
      { rateLimitMax: 2 },
      { excludePaths: [{ path: '/api/ok', exact: true }] }
    )
    try {
      // The exact path is exempt, its subtree is not.
      for (let index = 0; index < 4; index += 1) {
        const exact = await handler(new Request('http://localhost/api/ok'))
        expect(exact.status).toBe(200)
        expect(exact.headers.get('ratelimit-limit')).toBeNull()
      }
      const first = await handler(new Request('http://localhost/api/ok/sub'))
      expect(first.headers.get('ratelimit-remaining')).toBe('1')
      const second = await handler(new Request('http://localhost/api/ok/sub'))
      expect(second.headers.get('ratelimit-remaining')).toBe('0')
      const third = await handler(new Request('http://localhost/api/ok/sub'))
      expect(third.status).toBe(429)
    } finally {
      await dispose()
    }
  })

  it('ignores a trailing slash in the configured exclusion', async () => {
    const { handler, dispose } = serveWith(
      { rateLimitMax: 2 },
      { excludePaths: [{ path: '/api/ok/', exact: true }] }
    )
    try {
      for (let index = 0; index < 4; index += 1) {
        const response = await handler(new Request('http://localhost/api/ok'))
        expect(response.status).toBe(200)
        expect(response.headers.get('ratelimit-limit')).toBeNull()
      }
    } finally {
      await dispose()
    }
  })
})
