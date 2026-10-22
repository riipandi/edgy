import { Config, Effect } from 'effect'
import { BlockList, isIP } from 'node:net'
import {
  choice,
  custom,
  flag,
  group,
  int,
  invalid,
  milliseconds,
  secret,
  type ValueOf
} from './field.ts'

/**
 * The TRUST_PROXY setting, following the pocket-id concept: `false` trusts no
 * proxy, `true` trusts every address, and anything else is a comma-separated
 * list of proxy IPs or CIDR ranges.
 */
export interface TrustProxy {
  readonly trustAll: boolean
  readonly proxies: BlockList
}

const family = (address: string): 'ipv4' | 'ipv6' => (isIP(address) === 6 ? 'ipv6' : 'ipv4')

const addEntry = (proxies: BlockList, entry: string): void => {
  const separator = entry.indexOf('/')
  const address = separator === -1 ? entry : entry.slice(0, separator)
  if (isIP(address) === 0) throw new Error(`'${entry}' is not an IP or CIDR range`)
  if (separator === -1) proxies.addAddress(address, family(address))
  else proxies.addSubnet(address, Number(entry.slice(separator + 1)), family(address))
}

export const parseTrustProxy = (raw: string): Effect.Effect<TrustProxy, Config.ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim().toLowerCase()
    if (value === '' || value === 'false')
      return Effect.succeed<TrustProxy>({ trustAll: false, proxies: new BlockList() })
    if (value === 'true')
      return Effect.succeed<TrustProxy>({ trustAll: true, proxies: new BlockList() })

    const proxies = new BlockList()
    const entries = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    if (entries.length === 0)
      return Effect.fail(invalid('TRUST_PROXY', 'expected proxy IPs or CIDR ranges, or true/false'))
    for (const entry of entries) {
      try {
        addEntry(proxies, entry)
      } catch {
        return Effect.fail(invalid('TRUST_PROXY', `'${entry}' is not an IP or CIDR range`))
      }
    }
    return Effect.succeed<TrustProxy>({ trustAll: false, proxies })
  })

/** Whether `address` may set the client IP in X-Forwarded-For or X-Real-IP. */
export const isTrustedProxy = (trust: TrustProxy, address: string): boolean =>
  trust.trustAll || (isIP(address) !== 0 && trust.proxies.check(address, family(address)))

export const securityConfig = group(
  {
    rateLimitEnabled: flag('RATE_LIMIT_ENABLED', true, 'Enable API rate limiting'),
    rateLimitStore: choice(
      'RATE_LIMIT_STORE',
      ['database', 'redis'],
      'database',
      'Where rate-limit windows live: the database, or a shared Valkey/Redis'
    ),
    rateLimitRedisUrl: secret(
      'RATE_LIMIT_REDIS_URL',
      'redis://localhost:6379',
      'Valkey/Redis connection URL for the redis rate-limit store'
    ),
    rateLimitMax: int('RATE_LIMIT_MAX', 100, 'Requests allowed per client per window', 1),
    rateLimitWindow: milliseconds(
      'RATE_LIMIT_WINDOW',
      60_000,
      'Rate-limit window in milliseconds',
      1
    ),
    trustProxy: custom(
      {
        name: 'TRUST_PROXY',
        description:
          'Proxies that may set X-Forwarded-For: true, false, or comma-separated IPs/CIDRs',
        kind: 'string',
        default: 'false'
      },
      Config.String('TRUST_PROXY').pipe(
        Config.withDefault('false'),
        Config.mapEffect(parseTrustProxy)
      )
    )
  },
  'Security'
)

export type SecurityConfig = ValueOf<typeof securityConfig>
