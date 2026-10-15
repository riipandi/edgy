import { definePlugin, onRequest } from 'h3'
import { type ClientLocation, clientLocation } from './client_ip.ts'

/** Options for {@link locationHeaders}. */
export interface LocationHeadersOptions {
  /** `TRUSTED_PLATFORM`: location is believed only on a request that carries this header. */
  readonly platformHeader: string | undefined
}

/**
 * Records the client's country and city on `event.context.location` for the request log.
 * Registered only when `CLOUDFLARE_LOCATION_HEADERS` is on. Values are believed only on
 * requests that carry the platform header.
 */
export const locationHeaders = definePlugin<LocationHeadersOptions>((app, options) => {
  app.use(
    onRequest((event) => {
      const location: ClientLocation | undefined = clientLocation(event.req.headers, {
        enabled: true,
        platformHeader: options.platformHeader
      })
      if (location !== undefined) event.context.location = location
    })
  )
})
