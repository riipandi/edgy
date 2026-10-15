import { duration, group, int, type ValueOf } from './field.ts'

/** Abuse protection for the API routes. */
export const securityConfig = group(
  {
    rateLimitMax: int(
      'RATE_LIMIT_MAX',
      0,
      'Requests allowed per client per window on /api; 0 disables rate limiting'
    ),
    rateLimitWindow: duration('RATE_LIMIT_WINDOW', '1 minute', 'Length of the rate-limit window')
  },
  { title: 'Security' }
)

export type SecurityConfig = ValueOf<typeof securityConfig>
