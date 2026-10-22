import { it } from '@effect/vitest'
import { Duration, Effect, Layer, Redacted } from 'effect'
import { BlockList } from 'node:net'
import { TypeID } from 'typeid-js'
import { expect } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import { parseUserId } from './user_schema.ts'
import { UserCache, UserService, UserServiceLayer } from './user_service.ts'

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
    maxEntries: 16
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

const testConfig = Layer.succeed(AppConfig, config)

const ada = {
  id: TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8057').toString(),
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatar_url: null,
  role: 20,
  email_verified: 1,
  data: null,
  disabled: 0,
  created_at: '2024-01-01 00:00:00',
  updated_at: '2024-01-01 00:00:00'
}

it.effect('retries the lookup after a failed cache fill', () =>
  Effect.gen(function* () {
    let lookups = 0
    const flakyRepo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed([]),
        find: () => {
          lookups += 1
          return lookups === 1
            ? Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
            : Effect.succeed(ada)
        }
      })
    )
    const userDependencies = Layer.mergeAll(flakyRepo, UserCache.layer).pipe(
      Layer.provide(flakyRepo)
    )
    const service = yield* UserService.pipe(
      Effect.provide(
        UserServiceLayer.pipe(Layer.provide(userDependencies), Layer.provide(testConfig))
      )
    )

    const userId = parseUserId(ada.id)
    const failed = yield* Effect.exit(service.find(userId))
    expect(failed._tag).toBe('Failure')

    // The failed entry was invalidated: the next request hits the repository
    // again instead of replaying the stale failure until the TTL expires.
    const recovered = yield* service.find(userId)
    expect(recovered?.name).toBe('Ada Lovelace')
    expect(lookups).toBe(2)

    // The successful fill is cached.
    const cached = yield* service.find(userId)
    expect(cached?.name).toBe('Ada Lovelace')
    expect(lookups).toBe(2)
  })
)
