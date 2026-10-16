import { bodyLimit as h3BodyLimit, definePlugin } from 'h3'

/**
 * Rejects request bodies over `limit` bytes with `413`.
 *
 * Bytes are counted as the body streams, so a false `Content-Length` is still caught
 * before the body is fully buffered. A declared length over the limit is refused
 * before any byte is read.
 */
export const bodyLimit = definePlugin<number>((app, limit) => {
  app.use(h3BodyLimit(limit))
})
