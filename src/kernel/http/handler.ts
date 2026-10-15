import { Effect, Schema } from 'effect'
import { getQuery, getRouterParams, type H3Event, HTTPError, readBody } from 'h3'
import type { AppError, ValidationError } from '../errors.ts'
import type { Page } from '../pagination.ts'
import { decode } from './decode.ts'
import type { Reply } from './envelope.ts'
import { runEffect } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/**
 * What a handler may read from the request. Each input is optional; one that
 * is not declared reaches `run` as `undefined`, and the generics default to
 * that, so `run` is typed by exactly what the spec declared.
 */
interface Inputs<P, PI, B, BI, Q, QI> {
  readonly params?: Schema.Codec<P, PI>
  readonly body?: Schema.Codec<B, BI>
  readonly query?: Schema.Codec<Q, QI>
  /** Status of a successful response. Defaults to `200`. */
  readonly status?: number
}

type Program<A, E extends AppError> = Effect.Effect<A, E, HttpEnv>

type Handler = (event: H3Event) => Promise<unknown>

/**
 * A schema that was not declared decodes to `undefined`, which is what its
 * generic defaults to. TypeScript cannot see that link, hence the assertion.
 */
const decodeInput = <T, I>(
  schema: Schema.Codec<T, I> | undefined,
  read: () => unknown
): Effect.Effect<T, ValidationError> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  schema === undefined ? Effect.succeed(undefined as T) : decode(schema)(read())

/** `application/json` and `application/*+json` (e.g. `application/problem+json`). */
const JSON_CONTENT_TYPE = /^application\/([\w.-]+\+)?json\s*(;|$)/i

/**
 * Rejects a body that is not declared as JSON with `415`. `readBody` would
 * otherwise try to parse a form or text body as JSON and answer a misleading
 * validation error, or accept a `text/plain` body that skips CORS preflight.
 */
const requireJson = (event: H3Event): void => {
  const contentType = event.req.headers.get('content-type') ?? ''
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new HTTPError({ status: 415, message: 'Content-Type must be application/json' })
  }
}

/**
 * The plumbing every endpoint shares: read the body, decode params, body and
 * query, run the program, turn its value into a {@link Reply}, and let
 * `runEffect` render the envelope.
 *
 * Malformed JSON never reaches the program: `readBody` rejects it with h3's own
 * 400, which the app-level error hook renders in the common error shape.
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
    const rawBody = spec.body === undefined ? undefined : await readBody(event)

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
 * Declares an endpoint: what it reads, what it returns, and the Effect that
 * connects them. A handler states only its contract and its logic; `run`
 * receives exactly the inputs it declared.
 *
 * The value `run` returns is encoded through `response` — a failure to encode
 * is a defect (500), because the handler broke its own contract — and becomes
 * the `data` member of the success envelope.
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
  return makeHandler(spec, (value) =>
    encode(value).pipe(
      Effect.orDie,
      Effect.map((data) => ({ data }))
    )
  )
}

/**
 * Declares a collection endpoint. `run` returns a {@link Page}; its items are
 * encoded through the `items` schema (one element, not the array) and the page
 * position becomes the pagination metadata and links of the envelope.
 *
 * Pair it with `paginationQuery` for the `query` input and `toPageRequest` to
 * turn the decoded query into the request a repository takes.
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
  return makeHandler(spec, ({ items, page, limit, total }) =>
    encode(items).pipe(
      Effect.orDie,
      Effect.map((data) => ({ data, pagination: { page, limit, total } }))
    )
  )
}

/**
 * Declares an endpoint whose answer is a message and nothing else: the
 * envelope carries `message` and no `data`. For probes and acknowledgements;
 * `run` only has to succeed.
 */
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
): Handler => makeHandler(spec, () => Effect.succeed({ message: spec.message }))
