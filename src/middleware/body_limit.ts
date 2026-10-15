import { bodyLimit as h3BodyLimit, definePlugin } from 'h3'

/**
 * Rejects request bodies larger than `limit` bytes with `413`.
 *
 * Enforcement happens as the body is read (h3 counts bytes as they stream), so
 * a lying `Content-Length` is still caught and the body is never fully
 * buffered first. A declared `Content-Length` over the limit is rejected before
 * any byte is read.
 */
export const bodyLimit = definePlugin<number>((app, limit) => {
  app.use(h3BodyLimit(limit))
})
