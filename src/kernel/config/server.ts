import { Config, ConfigProvider, Effect } from 'effect'
import { flag, group, int, milliseconds, port, text, type ValueOf } from './field.ts'

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
    trustProxy: flag(
      'TRUST_PROXY',
      false,
      'Trust X-Forwarded-For (and, on Workers, CF-Connecting-IP) for the client address (enable only behind a proxy you control)'
    ),
    trustProxyHops: int(
      'TRUST_PROXY_HOPS',
      1,
      'How many proxies append to X-Forwarded-For before the request reaches the app; the client is the entry that many from the right (at least 1)'
    )
  },
  {
    title: 'Server',
    // Zero hops would read the proxy's own address, or past the start of the list.
    transform: (raw) =>
      raw.trustProxyHops < 1
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({ message: 'TRUST_PROXY_HOPS must be at least 1' })
            )
          )
        : Effect.succeed(raw)
  }
)

export type ServerConfig = ValueOf<typeof serverConfig>
