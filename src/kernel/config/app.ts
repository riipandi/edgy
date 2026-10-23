import { Config, Effect } from 'effect'
import type { ConfigError } from 'effect/Config'
import { custom, group, invalid, type ValueOf } from './field.ts'

/**
 * Normalizes APP_BASE_URL to its origin. Relative request paths are resolved
 * against it, so it must be an absolute http(s) URL; a trailing path is
 * dropped because only the origin takes part in that resolution.
 */
export const parseBaseUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim()
    if (value === '') return Effect.succeed('')
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? Effect.succeed(url.origin)
        : Effect.fail(invalid('APP_BASE_URL', `'${value}' must use http or https`))
    } catch {
      return Effect.fail(invalid('APP_BASE_URL', `'${value}' is not an absolute URL`))
    }
  })

export const appUrlConfig = group(
  {
    baseUrl: custom(
      {
        name: 'APP_BASE_URL',
        description: 'Public origin of the application, used to resolve relative request URLs',
        kind: 'string',
        default: 'http://localhost:3000'
      },
      Config.String('APP_BASE_URL').pipe(
        Config.withDefault('http://localhost:3000'),
        Config.mapEffect(parseBaseUrl)
      )
    )
  },
  'App'
)

export type AppUrlConfig = ValueOf<typeof appUrlConfig>
