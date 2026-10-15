import type { TrustedProxies } from '../ip.ts'
import { group, int, milliseconds, parsed, port, text, type ValueOf } from './field.ts'
import { parseTrustedPlatform, parseTrustProxy } from './proxy.ts'

/** HTTP server: where it listens, what it enforces per request, how it stops. */
export const serverConfig = group(
  {
    host: text('HOST', '0.0.0.0', 'Interface the HTTP server binds to'),
    port: port('PORT', 3000, 'Port the HTTP server listens on'),
    bodyLimit: int('BODY_LIMIT', 1_048_576, 'Largest accepted request body, in bytes (413 above)'),
    requestTimeout: milliseconds(
      'REQUEST_TIMEOUT',
      30_000,
      'A request running longer than this is interrupted and answered with 504',
      { min: 1 }
    ),
    shutdownTimeout: milliseconds(
      'SHUTDOWN_TIMEOUT',
      10_000,
      'How long a graceful shutdown waits for in-flight requests before closing them'
    ),
    shutdownDrainDelay: milliseconds(
      'SHUTDOWN_DRAIN_DELAY',
      0,
      'Pause between /health turning 503 and the server closing, so a load balancer can drain first'
    ),
    maxInFlight: int(
      'MAX_IN_FLIGHT',
      1024,
      'Requests handled at once before new ones are refused with 503 (overload guard); 0 disables'
    ),
    trustProxy: parsed<TrustedProxies>(
      'TRUST_PROXY',
      'false',
      'Proxies that may set the client address in X-Forwarded-For / X-Real-IP: false (none), true (every address; only when the app is unreachable except through your proxy), or a comma-separated list of IP addresses and CIDR ranges',
      parseTrustProxy
    ),
    trustedPlatform: parsed<string | undefined>(
      'TRUSTED_PLATFORM',
      '',
      "Header a CDN or platform sets to the client address, read directly instead of X-Forwarded-For (CF-Connecting-IP, Fly-Client-IP, X-Appengine-Remote-Addr, or your own proxy's); empty for none",
      parseTrustedPlatform
    )
  },
  { title: 'Server' }
)

export type ServerConfig = ValueOf<typeof serverConfig>
