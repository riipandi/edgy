import { Config, ConfigProvider, Effect } from 'effect'
import { choice, flag, group, int, milliseconds, secret, text, type ValueOf } from './field.ts'

/** Abuse protection for the API routes. */
export const securityConfig = group(
  {
    rateLimitEnabled: flag('RATE_LIMIT_ENABLED', false, 'Rate-limit the /api routes per client'),
    rateLimitMax: int(
      'RATE_LIMIT_MAX',
      100,
      'Requests allowed per client per window on /api (memory and redis stores)'
    ),
    rateLimitWindow: milliseconds('RATE_LIMIT_WINDOW', 60_000, 'Length of the rate-limit window', {
      min: 1
    }),
    rateLimitStore: choice(
      'RATE_LIMIT_STORE',
      ['memory', 'redis', 'cloudflare'],
      'memory',
      "Where counters live: per process (memory), shared by every instance (redis; Node.js only) or Cloudflare's rate-limit binding (cloudflare; Workers only, limit and period come from wrangler.jsonc)"
    ),
    rateLimitBinding: text(
      'RATE_LIMIT_BINDING',
      'RATE_LIMITER',
      'Name of the Workers rate-limit binding, used when RATE_LIMIT_STORE=cloudflare'
    ),
    redisUrl: secret(
      'REDIS_URL',
      'Redis or Valkey URL used when RATE_LIMIT_STORE=redis; the default is the Valkey of `pnpm compose:up`',
      'redis://:securedb@localhost:6379'
    )
  },
  {
    title: 'Security',
    // Enabled with an allowance below one would refuse every request.
    transform: (raw) =>
      raw.rateLimitEnabled && raw.rateLimitStore !== 'cloudflare' && raw.rateLimitMax < 1
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message: 'RATE_LIMIT_MAX must be at least 1 when RATE_LIMIT_ENABLED is true'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

export type SecurityConfig = ValueOf<typeof securityConfig>
