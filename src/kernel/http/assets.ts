import { definePlugin, type H3Event, serveStatic, type StaticAssetMeta } from 'h3'

/**
 * Where the built browser assets (`public/` of the build output) are read from. The Node server has
 * two implementations (a directory, or the assets embedded in a single executable); on Workers the
 * platform serves them before the Worker runs, so none is needed there.
 *
 * `id` is an opaque path under the asset root with a leading slash (`/assets/app-1a2b.js`). h3 has
 * already resolved dot segments and kept encoded separators encoded, so an implementation must
 * treat it as a name, never decode it again.
 */
export interface AssetSource {
  readonly meta: (id: string) => StaticAssetMeta | undefined | Promise<StaticAssetMeta | undefined>
  readonly contents: (
    id: string
  ) => BodyInit | null | undefined | Promise<BodyInit | null | undefined>
}

/** Build output names every file after its content hash, so a cached copy never goes stale. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * Serves `GET /assets/**` from an {@link AssetSource}. Registered only when the server has a source
 * for them; in development Vite serves the same URLs from the source tree.
 */
export const assetRoutes = definePlugin<AssetSource>((app, source) => {
  const serve = (event: H3Event) =>
    serveStatic(event, {
      getMeta: source.meta,
      getContents: source.contents,
      indexNames: [],
      headers: { 'cache-control': IMMUTABLE }
    })
  app.get('/assets/**', serve)
  app.head('/assets/**', serve)
})
