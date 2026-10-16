import type { Schema } from 'effect'

/**
 * What a handler declared about itself, kept beside the function so the API description can be
 * derived from the same schemas that validate and encode the traffic.
 */
export interface HandlerDoc {
  /** `one`: a single resource; `page`: a collection (`response` is one item); `message`: no data. */
  readonly kind: 'one' | 'page' | 'message'
  readonly summary?: string
  readonly params?: Schema.Top
  readonly query?: Schema.Top
  readonly body?: Schema.Top
  /** The `data` of a success, or one item of a page. */
  readonly response?: Schema.Top
  /** Status of a success. */
  readonly status: number
}

const docs = new WeakMap<object, HandlerDoc>()

/** Records `doc` for `handler` and returns the handler. */
export const documentHandler = <H extends object>(handler: H, doc: HandlerDoc): H => {
  docs.set(handler, doc)
  return handler
}

/** What `handler` declared, or `undefined` for a handler that did not go through the kit. */
export const docOf = (handler: object): HandlerDoc | undefined => docs.get(handler)
