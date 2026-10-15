import { Config, ConfigProvider, Effect } from 'effect'

/** Parsed CORS policy, consumed by the CORS middleware. */
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

/**
 * Parses a comma-separated env value into an allowlist.
 *
 * `*` (or an empty value) means "any", which is what h3's `CorsOptions.origin`
 * expects for a wildcard.
 */
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

/**
 * Cross-origin policy applied to every route. Variables: `CORS_ORIGINS`,
 * `CORS_METHODS`, `CORS_ALLOW_HEADERS`, `CORS_CREDENTIALS`, `CORS_MAX_AGE`.
 */
export const corsConfig = Config.all({
  origins: Config.String('CORS_ORIGINS').pipe(Config.withDefault('*')),
  methods: Config.String('CORS_METHODS').pipe(Config.withDefault('*')),
  allowHeaders: Config.String('CORS_ALLOW_HEADERS').pipe(Config.withDefault('*')),
  credentials: Config.Boolean('CORS_CREDENTIALS').pipe(Config.withDefault(false)),
  maxAge: Config.String('CORS_MAX_AGE').pipe(Config.withDefault('86400'))
}).pipe(
  Config.mapEffect((raw) => {
    const origins = parseList(raw.origins)

    // h3 rejects `credentials: true` with a wildcard origin because
    // `Access-Control-Allow-Origin: *` is invalid for credentialed requests.
    // Fail while the layer is built so the mistake surfaces at startup.
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
  })
)
