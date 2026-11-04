import { isIP } from 'node:net'
import { family, type TrustProxy } from './validators.ts'

export const isTrustedProxy = (trust: TrustProxy, address: string): boolean =>
  trust.trustAll || (isIP(address) !== 0 && trust.proxies.check(address, family(address)))

export const redisDatabases = {
  cache: 1,
  rateLimit: 2
} as const

export type RedisDatabaseName = keyof typeof redisDatabases

export const redisUrlFor = (url: string, database: number): string => {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.href
}

export const redisUrlForDatabase = (url: string, name: RedisDatabaseName): string =>
  redisUrlFor(url, redisDatabases[name])

export const DEV_HEADERS = 'authorization=edgy-dev-ingestion-key'

export const telemetryEnabled = (config: {
  readonly sdkDisabled: boolean
  readonly endpoint: string
}): boolean => !config.sdkDisabled && config.endpoint !== ''
