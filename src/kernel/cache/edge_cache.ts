import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/persistence'

/** The part of Cloudflare's Cache API (`caches.default`) this store uses. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

/** `caches.default`, or `undefined` outside a Workers runtime. */
export const defaultEdgeCache = (): EdgeCache | undefined =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  (globalThis as { caches?: { default?: EdgeCache } }).caches?.default

/** Used when an entry has no TTL: the Cache API needs a `max-age`, and a day is generous. */
const DEFAULT_TTL_SECONDS = 86_400

const fail = (message: string) => (cause: unknown) =>
  new Persistence.PersistenceError({ message, cause })

/**
 * A backing store over the Workers Cache API.
 *
 * Entries are JSON `Response`s under a made-up GET URL (`https://edgy.cache/<store>/<key>`),
 * stored with `Cache-Control: max-age=<ttl>`, which is how that API expires them, to the
 * second (so a TTL is rounded up to a whole second, at least one). What to know:
 *
 * - **Per data center.** An entry is visible only in the location that stored it, and a
 *   removal only removes it there; other locations keep theirs until the TTL ends. That is
 *   the same staleness `memory` has between instances, now shared by every isolate in one location.
 * - **No global clear.** The API cannot list or purge, so `clear` does nothing; entries expire.
 * - **Not on `*.workers.dev`.** The API silently stores nothing there, so the cache is just
 *   absent: every read reaches the database. Use a custom domain.
 * - **Writes are awaited** (there is no `ctx.waitUntil` here), which costs a millisecond on a
 *   miss; the next read in the location is served from the cache.
 */
export const layerBackingEdgeCache = (
  cache: EdgeCache
): Layer.Layer<Persistence.BackingPersistence> =>
  Layer.succeed(Persistence.BackingPersistence)(
    Persistence.BackingPersistence.of({
      make: (storeId) =>
        Effect.sync(() => {
          const requestFor = (key: string) =>
            new Request(
              `https://edgy.cache/${encodeURIComponent(storeId)}/${encodeURIComponent(key)}`
            )

          const get = (key: string) =>
            Effect.tryPromise({
              try: async () => {
                const hit = await cache.match(requestFor(key))
                if (hit === undefined) return undefined
                // `unknown`, not `any`: `Persistence` validates it against the schema on read.
                const value: unknown = await hit.json().catch(() => undefined)
                return typeof value === 'object' && value !== null ? value : undefined
              },
              catch: fail(`Failed to read key ${key} from the Cache API`)
            })

          const set = (key: string, value: object, ttl: Duration.Duration | undefined) =>
            Effect.tryPromise({
              try: () =>
                cache.put(
                  requestFor(key),
                  new Response(JSON.stringify(value), {
                    headers: {
                      'content-type': 'application/json',
                      'cache-control': `public, max-age=${
                        ttl === undefined
                          ? DEFAULT_TTL_SECONDS
                          : Math.max(1, Math.ceil(Duration.toMillis(ttl) / 1000))
                      }`
                    }
                  })
                ),
              catch: fail(`Failed to write key ${key} to the Cache API`)
            })

          return {
            get,
            getMany: (keys) => Effect.forEach(keys, get, { concurrency: 'unbounded' }),
            set,
            setMany: (entries) =>
              Effect.forEach(entries, ([key, value, ttl]) => set(key, value, ttl), {
                concurrency: 'unbounded',
                discard: true
              }),
            remove: (key) =>
              Effect.tryPromise({
                try: () => cache.delete(requestFor(key)).then(() => undefined),
                catch: fail(`Failed to remove key ${key} from the Cache API`)
              }),
            clear: Effect.void
          }
        })
    })
  )
