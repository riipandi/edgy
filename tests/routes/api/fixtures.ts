import { Duration, Effect, Layer, Redacted } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { BlockList } from 'node:net'
import { TypeID } from 'typeid-js'
import { Database, DatabaseError, makeDatabaseService } from '#/database/adapter.ts'
import { openDatabase } from '#/database/dialect/sqlite.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { apiRoutes } from '#/kernel/http/api.ts'
import { RateLimitCounterLayer } from '#/middleware/rate-limit.ts'
import { HealthService } from '#/modules/health/health_service.ts'
import { UserRepositoryError } from '#/modules/user/user_repo.ts'
import { UserService } from '#/modules/user/user_service.ts'

export const user = (uuid: string, name: string) => ({
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

export const users = [
  user('01890a5d-ac96-774b-bcce-b302099a8057', 'Ada Lovelace'),
  user('01890a5d-ac96-774b-bcce-b302099a8058', 'Grace Hopper')
]

export const testService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.succeed(users),
    find: (id) => Effect.succeed(users.find((candidate) => candidate.id === id.toString()))
  })
)

export const unavailableUserService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    find: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
  })
)

export const readyService = Layer.succeed(HealthService, HealthService.of({ check: Effect.void }))
export const unavailableService = Layer.succeed(
  HealthService,
  HealthService.of({ check: Effect.fail(new DatabaseError({ cause: new Error('offline') })) })
)

export const testServices = Layer.mergeAll(testService, readyService)

export const config: AppConfigShape = {
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
  },
  docs: { enabled: false }
}

export const testConfig = Layer.succeed(AppConfig, config)

export const limitedConfig = Layer.succeed(AppConfig, {
  ...config,
  security: { ...config.security, rateLimitMax: 2 }
})

export const docsConfig = Layer.succeed(AppConfig, { ...config, docs: { enabled: true } })

// The rate-limit counter writes to the rate_limits table, so its database
// starts migrated.
const migratedDatabase = Layer.effect(
  Database,
  Effect.gen(function* () {
    const db = openDatabase(':memory:')
    const service = makeDatabaseService(db)
    yield* migrateToLatest.pipe(Effect.provideService(Database, service))
    return service
  })
)

/** Builds a web handler over the composed API routes with the given services and config. */
export const toHandler = (services: Layer.Layer<any>, appConfig: Layer.Layer<AppConfig>) => {
  const { handler, dispose } = HttpRouter.toWebHandler(
    apiRoutes.pipe(
      HttpRouter.provideRequest(services),
      Layer.provide(RateLimitCounterLayer),
      Layer.provide(migratedDatabase),
      Layer.provide(appConfig),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )
  return { handler, dispose }
}
