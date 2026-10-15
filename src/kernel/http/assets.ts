import { definePlugin, type H3Event, serveStatic, type StaticAssetMeta } from 'h3'

/**
 * Browser assets from the build output. Node has two sources (a directory, or assets embedded in
 * an executable); Workers serve assets before the Worker runs, so they need none.
 *
 * `id` is an opaque path with a leading slash (`/assets/app-1a2b.js`). h3 has already resolved dot
 * segments and kept encoded separators encoded, so treat it as a name and never decode it again.
 */
export interface AssetSource {
  readonly meta: (id: string) => StaticAssetMeta | undefined | Promise<StaticAssetMeta | undefined>
  readonly contents: (
    id: string
  ) => BodyInit | null | undefined | Promise<BodyInit | null | undefined>
}

/** Build output names every file after its content hash, so a cached copy never goes stale. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** Serves `GET /assets/**` from an `AssetSource`. Registered only with a source. */
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
