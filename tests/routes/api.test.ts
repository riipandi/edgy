import { Duration, Effect, Layer, Redacted } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { BlockList } from 'node:net'
import { TypeID } from 'typeid-js'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { DatabaseError } from '#/database/adapter.ts'
import { Database, makeDatabaseService } from '#/database/adapter.ts'
import { openDatabase } from '#/database/dialect/sqlite.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { apiRoutes } from '#/kernel/http/api.ts'
import { RateLimitCounterLayer } from '#/middleware/rate-limit.ts'
import { HealthService } from '#/modules/health/health_service.ts'
import { UserRepositoryError } from '#/modules/user/user_repo.ts'
import { UserService } from '#/modules/user/user_service.ts'

const user = (uuid: string, name: string) => ({
  id: TypeID.fromUUID('user', uuid).toString(),
  email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
  name,
  avatar_url: null,
  role: 20,
  email_verified: 1,
  data: null,
  disabled: 0,
  created_at: '2024-01-01 00:00:00',
  updated_at: '2024-01-01 00:00:00'
})

const users = [
  user('01890a5d-ac96-774b-bcce-b302099a8057', 'Ada Lovelace'),
  user('01890a5d-ac96-774b-bcce-b302099a8058', 'Grace Hopper')
]

const testService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.succeed(users),
    find: (id) => Effect.succeed(users.find((candidate) => candidate.id === id))
  })
)
const unavailableUserService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    find: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
  })
)

const readyService = Layer.succeed(HealthService, HealthService.of({ check: Effect.void }))
const unavailableService = Layer.succeed(
  HealthService,
  HealthService.of({ check: Effect.fail(new DatabaseError({ cause: new Error('offline') })) })
)
const testServices = Layer.mergeAll(testService, readyService)

const config: AppConfigShape = {
  server: { host: '127.0.0.1', port: 0 },
  database: { driver: 'sqlite', path: ':memory:', autoMigrate: false },
  logging: {
    level: 'Info',
    transport: ['console'],
    file: 'storage/logs/app.jsonl',
    rotation: 'daily',
    fileMaxFiles: 14,
    format: 'pretty',
    flushInterval: Duration.millis(250)
  },
  security: {
    rateLimitEnabled: true,
    rateLimitMax: 1000,
    rateLimitWindow: Duration.millis(60_000),
    rateLimitStore: 'database',
    rateLimitRedisUrl: Redacted.make('redis://localhost:6379'),
    trustProxy: { trustAll: false, proxies: new BlockList() }
  },
  cache: {
    enabled: true,
    storage: 'memory',
    redisUrl: Redacted.make('redis://localhost:6379'),
    ttl: Duration.millis(30_000),
    maxEntries: 256
  },
  observability: {
    metricsEnabled: false,
    sdkDisabled: true,
    endpoint: 'http://localhost:4318',
    headers: Redacted.make('authorization=dev-key'),
    serviceName: 'edgy',
    exportInterval: Duration.millis(5_000),
    compression: 'gzip'
  }
}

const testConfig = Layer.succeed(AppConfig, config)
const limitedConfig = Layer.succeed(AppConfig, {
  ...config,
  security: { ...config.security, rateLimitMax: 2 }
})

// The rate-limit counter writes to the rate_limits table, so its database
// starts migrated.
const migratedDatabase = Layer.effect(
  Database,
  Effect.gen(function* () {
    const db = openDatabase(':memory:')
    const result = yield* Effect.tryPromise({
      try: () => migrateToLatest(db),
      catch: (cause) => new Error(String(cause))
    })
    if (result.error !== undefined) return yield* Effect.fail(new Error('migration failed'))
    return makeDatabaseService(db)
  })
)

const { handler: limitedHandler, dispose: disposeLimitedHandler } = HttpRouter.toWebHandler(
  apiRoutes.pipe(
    HttpRouter.provideRequest(testServices),
    Layer.provide(RateLimitCounterLayer),
    Layer.provide(migratedDatabase),
    Layer.provide(limitedConfig),
    Layer.provide(HttpServer.layerServices)
  ),
  { disableLogger: true }
)

const { handler, dispose } = HttpRouter.toWebHandler(
  apiRoutes.pipe(
    HttpRouter.provideRequest(testServices),
    Layer.provide(RateLimitCounterLayer),
    Layer.provide(migratedDatabase),
    Layer.provide(testConfig),
    Layer.provide(HttpServer.layerServices)
  ),
  { disableLogger: true }
)

const { handler: unavailableHandler, dispose: disposeUnavailableHandler } = HttpRouter.toWebHandler(
  apiRoutes.pipe(
    HttpRouter.provideRequest(Layer.mergeAll(testService, unavailableService)),
    Layer.provide(RateLimitCounterLayer),
    Layer.provide(migratedDatabase),
    Layer.provide(testConfig),
    Layer.provide(HttpServer.layerServices)
  ),
  { disableLogger: true }
)

const { handler: unavailableUsersHandler, dispose: disposeUnavailableUsersHandler } =
  HttpRouter.toWebHandler(
    apiRoutes.pipe(
      HttpRouter.provideRequest(Layer.mergeAll(unavailableUserService, readyService)),
      Layer.provide(RateLimitCounterLayer),
      Layer.provide(migratedDatabase),
      Layer.provide(testConfig),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )

afterAll(async () => {
  await Promise.all([
    disposeLimitedHandler(),
    dispose(),
    disposeUnavailableHandler(),
    disposeUnavailableUsersHandler()
  ])
})

describe('GET /api/health', () => {
  it('responds 200 when the database answers the readiness probe', async () => {
    const response = await handler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('responds 503 when the database readiness probe fails', async () => {
    const response = await unavailableHandler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable' })
  })
})

describe('GET /api/users', () => {
  it('responds 200 with the seeded user list', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(2)
    expect(body.map((entry: { name: string }) => entry.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper'
    ])
  })

  it('maps repository failures to a sanitized 503 response', async () => {
    const response = await unavailableUsersHandler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ message: 'Service unavailable' })
  })
})

describe('GET /api/users/:id', () => {
  it('responds 200 with the requested user', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'Ada Lovelace' })
  })

  it('responds 400 for a non-TypeID id', async () => {
    const response = await handler(new Request('http://localhost/api/users/not-a-typeid'))
    expect(response.status).toBe(400)
  })

  it('responds 404 for an unknown id', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await handler(new Request(`http://localhost/api/users/${missing}`))
    expect(response.status).toBe(404)
  })
})

describe('unknown API path', () => {
  it('responds 404', async () => {
    const response = await handler(new Request('http://localhost/api/nope'))
    expect(response.status).toBe(404)
  })
})

describe('rate limiting', () => {
  const headers = { 'x-forwarded-for': '203.0.113.7' }

  it('counts requests and exposes RateLimit headers while under the max', async () => {
    const first = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(first.status).toBe(200)
    expect(first.headers.get('ratelimit-limit')).toBe('2')
    expect(first.headers.get('ratelimit-remaining')).toBe('1')

    const second = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(second.status).toBe(200)
    expect(second.headers.get('ratelimit-remaining')).toBe('0')
  })

  it('responds 429 once the max is exceeded', async () => {
    const response = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('Too Many Requests')
    expect(response.headers.get('ratelimit-remaining')).toBe('0')
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
  })
})
