import { Config, Effect, Redacted } from 'effect'
import type { ConfigError } from 'effect/Config'
import { custom, flag, group, invalid, type ValueOf } from './field.ts'

/** The credentials the development compose file starts Redis with. */
const DEV_REDIS_URL = 'redis://default:securedb@localhost:6379'

export const parseRedisUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim()
    if (!/^rediss?:\/\//.test(value))
      return Effect.fail(invalid('REDIS_URL', `'${value}' is not a redis:// or rediss:// URL`))
    try {
      new URL(value)
      return Effect.succeed(value)
    } catch {
      return Effect.fail(invalid('REDIS_URL', `'${value}' is not a valid URL`))
    }
  })

/**
 * One Redis connection shared by every feature that needs one. Consumers are
 * separated by database index rather than by URL, so a deployment configures a
 * single server and each feature keeps its own keyspace.
 */
export const redisConfig = group(
  {
    enabled: flag(
      'REDIS_ENABLE',
      false,
      'Use Redis for the configured rate-limit and cache stores'
    ),
    url: custom(
      {
        name: 'REDIS_URL',
        description: 'Redis connection URL; each feature uses its own database index',
        kind: 'secret',
        default: DEV_REDIS_URL
      },
      Config.Redacted('REDIS_URL').pipe(
        Config.withDefault(Redacted.make(DEV_REDIS_URL)),
        Config.mapEffect((value) => parseRedisUrl(Redacted.value(value)))
      )
    )
  },
  'Redis'
)

export type RedisConfig = ValueOf<typeof redisConfig>

/** Database index per consumer: one keyspace each, one server to operate. */
export const redisDatabases = {
  cache: 1,
  rateLimit: 2
} as const

export type RedisDatabaseName = keyof typeof redisDatabases

/** The same connection pointed at another database index. */
export const redisUrlFor = (url: string, database: number): string => {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.href
}

export const redisUrlForDatabase = (url: string, name: RedisDatabaseName): string =>
  redisUrlFor(url, redisDatabases[name])
