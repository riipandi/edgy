import { duration, flag, group, int, port, text, type ValueOf } from './field.ts'

/** HTTP server: where it listens, what it enforces per request, how it stops. */
export const serverConfig = group(
  {
    host: text('HOST', '0.0.0.0', 'Interface the HTTP server binds to'),
    port: port('PORT', 3000, 'Port the HTTP server listens on'),
    bodyLimit: int('BODY_LIMIT', 1_048_576, 'Largest accepted request body, in bytes (413 above)'),
    requestTimeout: duration(
      'REQUEST_TIMEOUT',
      '30 seconds',
      'A request running longer than this is interrupted and answered with 504'
    ),
    shutdownTimeout: duration(
      'SHUTDOWN_TIMEOUT',
      '10 seconds',
      'How long a graceful shutdown waits for in-flight requests before closing them'
    ),
    shutdownDrainDelay: duration(
      'SHUTDOWN_DRAIN_DELAY',
      '0 millis',
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
      'Trust X-Forwarded-For / CF-Connecting-IP for the client address (enable only behind a proxy you control)'
    )
  },
  { title: 'Server' }
)

export type ServerConfig = ValueOf<typeof serverConfig>
