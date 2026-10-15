import { Duration, Effect, Schema } from 'effect'
import { getQuery, getRouterParams, type H3Event, HTTPError, readBody } from 'h3'
import type { AppError, ValidationError } from '../errors.ts'
import type { Page } from '../pagination.ts'
import { decode } from './decode.ts'
import type { Reply } from './envelope.ts'
import { documentHandler, type HandlerDoc } from './handler_doc.ts'
import { runEffect } from './responder.ts'
import { type HttpEnv, runtimeOf } from './runtime.ts'

/** What a handler reads from the request. An undeclared input reaches `run` as `undefined`. */
interface Inputs<P, PI, B, BI, Q, QI> {
  readonly params?: Schema.Codec<P, PI>
  readonly body?: Schema.Codec<B, BI>
  readonly query?: Schema.Codec<Q, QI>
  /** Status of a successful response. Defaults to `200`. */
  readonly status?: number
  /** One line for the API description. */
  readonly summary?: string
}

/** The declared inputs, as the API description reads them. */
const docOfSpec = (
  kind: HandlerDoc['kind'],
  spec: {
    readonly params?: Schema.Top
    readonly query?: Schema.Top
    readonly body?: Schema.Top
    readonly status?: number
    readonly summary?: string
  },
  response?: Schema.Top
): HandlerDoc => ({
  kind,
  status: spec.status ?? 200,
  ...(spec.summary === undefined ? {} : { summary: spec.summary }),
  ...(spec.params === undefined ? {} : { params: spec.params }),
  ...(spec.query === undefined ? {} : { query: spec.query }),
  ...(spec.body === undefined ? {} : { body: spec.body }),
  ...(response === undefined ? {} : { response })
})

type Program<A, E extends AppError> = Effect.Effect<A, E, HttpEnv>

type Handler = (event: H3Event) => Promise<unknown>

/** An undeclared schema decodes to `undefined`; TypeScript cannot see that, hence the assertion. */
const decodeInput = <T, I>(
  schema: Schema.Codec<T, I> | undefined,
  read: () => unknown
): Effect.Effect<T, ValidationError> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  schema === undefined ? Effect.succeed(undefined as T) : decode(schema)(read())

/** `application/json` and `application/*+json` (e.g. `application/problem+json`). */
const JSON_CONTENT_TYPE = /^application\/([\w.-]+\+)?json\s*(;|$)/i

/**
 * Rejects a non-JSON body with `415`. Otherwise `readBody` parses it as JSON anyway, or accepts
 * a `text/plain` body that skips CORS preflight.
 */
const requireJson = (event: H3Event): void => {
  const contentType = event.req.headers.get('content-type') ?? ''
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new HTTPError({ status: 415, message: 'Content-Type must be application/json' })
  }
}

/**
 * Reads the JSON body, giving up after `REQUEST_TIMEOUT` with `408`. The program has its own
 * timeout, but the body is read before it starts. Without this, a client that sends headers and
 * stalls holds an in-flight slot, and enough of them make the overload guard refuse everyone.
 */
const readBodyWithin = async (event: H3Event): Promise<unknown> => {
  const limit = Duration.toMillis(runtimeOf(event).requestTimeout)
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new HTTPError({ status: 408, message: 'Request body timed out' })),
      limit
    )
  })
  const reading = readBody(event)
  // The read outlives the race when the timer wins; its late failure must not be unhandled.
  reading.catch(() => undefined)
  try {
    return await Promise.race([reading, expired])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The plumbing every endpoint shares. Malformed JSON never reaches the program: h3 rejects it
 * with its own 400, which the error hook renders in the common shape.
 */
const makeHandler =
  <V, E extends AppError, P, PI, B, BI, Q, QI>(
    spec: Inputs<P, PI, B, BI, Q, QI> & {
      readonly run: (input: { params: P; body: B; query: Q }) => Program<V, E>
    },
    toReply: (value: V) => Effect.Effect<Reply>
  ): Handler =>
  async (event) => {
    if (spec.body !== undefined) requireJson(event)
    const rawBody = spec.body === undefined ? undefined : await readBodyWithin(event)

    return runEffect(
      event,
      Effect.gen(function* () {
        const params = yield* decodeInput(spec.params, () => getRouterParams(event))
        const body = yield* decodeInput(spec.body, () => rawBody)
        const query = yield* decodeInput(spec.query, () => getQuery(event))
        return yield* toReply(yield* spec.run({ params, body, query }))
      }),
      spec.status === undefined ? {} : { successStatus: spec.status }
    )
  }

/**
 * Declares an endpoint. `run` receives exactly the inputs it declared. Its value is encoded
 * through `response` and becomes the `data` member of the success envelope. An encoding failure
 * is a defect (500): the handler broke its own contract.
 *
 * @example
 * ```ts
 * export const getUserHandler = defineHandler({
 *   params: UserIdParamsSchema,
 *   response: UserGetResponseSchema,
 *   run: ({ params }) => UserService.use((users) => users.get(params.id))
 * })
 * ```
 */
export const defineHandler = <
  A,
  I,
  E extends AppError,
  P = undefined,
  PI = unknown,
  B = undefined,
  BI = unknown,
  Q = undefined,
  QI = unknown
>(
  spec: Inputs<P, PI, B, BI, Q, QI> & {
    /** Schema the returned value is encoded through. */
    readonly response: Schema.Codec<A, I>
    readonly run: (input: { params: P; body: B; query: Q }) => Program<A, E>
  }
): Handler => {
  const encode = Schema.encodeEffect(spec.response)
  return documentHandler(
    makeHandler(spec, (value) =>
      encode(value).pipe(
        Effect.orDie,
        Effect.map((data) => ({ data }))
      )
    ),
    docOfSpec('one', spec, spec.response)
  )
}

/**
 * Declares a collection endpoint. `run` returns a `Page`; each item is encoded through `items`,
 * and the page position becomes the envelope's pagination metadata and links.
 *
 * Pair it with `paginationQuery` (the query input) and `toPageRequest` (the repository request).
 */
export const definePagedHandler = <
  A,
  I,
  E extends AppError,
  P = undefined,
  PI = unknown,
  B = undefined,
  BI = unknown,
  Q = undefined,
  QI = unknown
>(
  spec: Inputs<P, PI, B, BI, Q, QI> & {
    /** Schema each item of the page is encoded through. */
    readonly items: Schema.Codec<A, I>
    readonly run: (input: { params: P; body: B; query: Q }) => Program<Page<A>, E>
  }
): Handler => {
  const encode = Schema.encodeEffect(Schema.Array(spec.items))
  return documentHandler(
    makeHandler(spec, ({ items, limit, next }) =>
      encode(items).pipe(
        Effect.orDie,
        Effect.map((data) => ({ data, pagination: { limit, next } }))
      )
    ),
    docOfSpec('page', spec, spec.items)
  )
}

/** An endpoint that answers only with `message` (no `data`), for probes and acknowledgements. */
export const defineMessageHandler = <
  E extends AppError,
  P = undefined,
  PI = unknown,
  B = undefined,
  BI = unknown,
  Q = undefined,
  QI = unknown
>(
  spec: Inputs<P, PI, B, BI, Q, QI> & {
    readonly message: string
    readonly run: (input: { params: P; body: B; query: Q }) => Program<unknown, E>
  }
): Handler =>
  documentHandler(
    makeHandler(spec, () => Effect.succeed({ message: spec.message })),
    docOfSpec('message', spec)
  )
