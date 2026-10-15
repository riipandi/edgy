import { Config, ConfigProvider, Effect } from 'effect'
import { Redacted } from 'effect'
import { choice, duration, group, int, secret, type ValueOf } from './field.ts'

/** Abuse protection for the API routes. */
export const securityConfig = group(
  {
    rateLimitMax: int(
      'RATE_LIMIT_MAX',
      0,
      'Requests allowed per client per window on /api; 0 disables rate limiting'
    ),
    rateLimitWindow: duration('RATE_LIMIT_WINDOW', '1 minute', 'Length of the rate-limit window'),
    rateLimitStore: choice(
      'RATE_LIMIT_STORE',
      ['memory', 'redis'],
      'memory',
      'Where counters live: per process (memory) or shared by every instance (redis; Node.js only)'
    ),
    redisUrl: secret(
      'REDIS_URL',
      'Redis or Valkey URL for RATE_LIMIT_STORE=redis, e.g. redis://:password@localhost:6379'
    )
  },
  {
    title: 'Security',
    transform: (raw) =>
      raw.rateLimitStore === 'redis' && Redacted.value(raw.redisUrl) === ''
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message: 'RATE_LIMIT_STORE=redis requires REDIS_URL'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

export type SecurityConfig = ValueOf<typeof securityConfig>
