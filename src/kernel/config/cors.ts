import { Config, ConfigProvider, Effect } from 'effect'
import { flag, group, text } from './field.ts'

/** Parsed CORS policy. */
export interface CorsConfig {
  /** Allowed origins: `*` for any, otherwise an explicit allowlist. */
  readonly origins: '*' | readonly string[]
  /** Allowed methods for preflight requests. */
  readonly methods: '*' | readonly string[]
  /** Allowed request headers for preflight requests. */
  readonly allowHeaders: '*' | readonly string[]
  /** Whether to send `access-control-allow-credentials`. */
  readonly credentials: boolean
  /** `access-control-max-age` value, or `false` to omit the header. */
  readonly maxAge: string | false
}

/** Parses a comma-separated list. `*` or an empty value means any. */
const parseList = (value: string): '*' | readonly string[] => {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '*') return '*'
  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** Parses `CORS_MAX_AGE`; `false` (or `0`) omits the preflight cache header. */
const parseMaxAge = (value: string): string | false => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === '' || trimmed === 'false' || trimmed === '0') return false
  return trimmed
}

/** Cross-origin policy for every route. Validated as a whole after all fields parse. */
export const corsConfig = group(
  {
    origins: text('CORS_ORIGINS', '*', 'Comma-separated allowed origins, or * for any'),
    methods: text('CORS_METHODS', '*', 'Comma-separated allowed methods, or * for any'),
    allowHeaders: text(
      'CORS_ALLOW_HEADERS',
      '*',
      'Comma-separated allowed request headers, or * for any'
    ),
    credentials: flag(
      'CORS_CREDENTIALS',
      false,
      'Send access-control-allow-credentials (requires explicit CORS_ORIGINS)'
    ),
    maxAge: text('CORS_MAX_AGE', '86400', 'Preflight cache seconds; 0 or false omits the header')
  },
  {
    title: 'CORS',
    transform: (raw) => {
      const origins = parseList(raw.origins)

      // A wildcard origin is invalid for credentialed requests, so fail while the layer
      // builds, at startup.
      if (raw.credentials && origins === '*') {
        return Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({
              message:
                'CORS_CREDENTIALS=true requires an explicit CORS_ORIGINS allowlist (wildcard "*" is invalid with credentials)'
            })
          )
        )
      }

      return Effect.succeed({
        origins,
        methods: parseList(raw.methods),
        allowHeaders: parseList(raw.allowHeaders),
        credentials: raw.credentials,
        maxAge: parseMaxAge(raw.maxAge)
      } satisfies CorsConfig)
    }
  }
)
