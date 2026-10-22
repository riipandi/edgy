import { flag, group, int, milliseconds, type ValueOf } from './field.ts'

export const securityConfig = group(
  {
    rateLimitEnabled: flag('RATE_LIMIT_ENABLED', true, 'Enable API rate limiting'),
    rateLimitMax: int('RATE_LIMIT_MAX', 100, 'Requests allowed per client per window', 1),
    rateLimitWindow: milliseconds(
      'RATE_LIMIT_WINDOW',
      60_000,
      'Rate-limit window in milliseconds',
      1
    )
  },
  'Security'
)

export type SecurityConfig = ValueOf<typeof securityConfig>
