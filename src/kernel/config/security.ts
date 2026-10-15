import { choice, group, int, milliseconds, secret, type ValueOf } from './field.ts'

/** Abuse protection for the API routes. */
export const securityConfig = group(
  {
    rateLimitMax: int(
      'RATE_LIMIT_MAX',
      0,
      'Requests allowed per client per window on /api; 0 disables rate limiting'
    ),
    rateLimitWindow: milliseconds('RATE_LIMIT_WINDOW', 60_000, 'Length of the rate-limit window', {
      min: 1
    }),
    rateLimitStore: choice(
      'RATE_LIMIT_STORE',
      ['memory', 'redis'],
      'memory',
      'Where counters live: per process (memory) or shared by every instance (redis; Node.js only)'
    ),
    redisUrl: secret(
      'REDIS_URL',
      'Redis or Valkey URL used when RATE_LIMIT_STORE=redis; the default is the Valkey of `pnpm compose:up`',
      'redis://:securedb@localhost:6379'
    )
  },
  { title: 'Security' }
)

export type SecurityConfig = ValueOf<typeof securityConfig>
