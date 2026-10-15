import { definePlugin, onRequest } from 'h3'

/** Options for {@link cacheControl}. */
export interface CacheControlOptions {
  /** `Cache-Control` header value. Defaults to a one-hour public cache. */
  readonly value?: string
  /**
   * Also set it on error responses. Off by default, because a cached `404` is a trap for
   * public resources. Turn it on for `no-store`, where errors must not be cached either.
   */
  readonly errors?: boolean
}

/**
 * Sets a `Cache-Control` header on every response of the scope it is registered in.
 * Registered on a group's `middleware`, it covers only that group's routes, such as
 * `/.well-known`.
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
