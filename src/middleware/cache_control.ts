import { definePlugin, onRequest } from 'h3'

/** Options for {@link cacheControl}. */
export interface CacheControlOptions {
  /** `Cache-Control` header value. Defaults to a one-hour public cache. */
  readonly value?: string
  /**
   * Also set it on error responses. Off by default: a cached `404` is a trap for a public
   * resource, while for `no-store` the error is exactly what must not be cached.
   */
  readonly errors?: boolean
}

/**
 * Sets a `Cache-Control` header on every response of the scope it is
 * registered in.
 *
 * As a plugin it composes with groups: register it on a group's `middleware`
 * to cache only that group's routes (e.g. `/.well-known`).
 */
export const cacheControl = definePlugin<CacheControlOptions>((app, options) => {
  const value = options.value ?? 'public, max-age=3600'

  app.use(
    onRequest((event) => {
      event.res.headers.set('cache-control', value)
      if (options.errors === true) event.res.errHeaders.set('cache-control', value)
    })
  )
})
