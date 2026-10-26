import { Context, Option } from 'effect'
import type { ConsumeVerdict } from '#/middleware/rate-limit.ts'

// Ambient per-request data the envelope's metadata reads back out. Each is
// its own Context.Reference, owned by the one middleware that knows it
// (request-id.ts, rate-limit.ts) — matching this codebase's one-tag-per-
// concern convention instead of one struct two middlewares must merge into.
// A Reference always resolves (falls back to its default), so a handler
// running without either middleware (a unit test, a fixture) still builds a
// well-formed envelope.

export const RequestId = Context.Reference<string>('RequestId', {
  defaultValue: () => ''
})

export const RateLimitVerdict = Context.Reference<Option.Option<ConsumeVerdict>>(
  'RateLimitVerdict',
  { defaultValue: () => Option.none() }
)
