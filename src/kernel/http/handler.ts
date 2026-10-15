import { Effect, type Schema } from 'effect'
import { getRouterParams, type H3Event, readBody } from 'h3'
import type { AppError } from '../errors.ts'
import { decode } from './decode.ts'
import { runEffect } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

interface HandlerBase<A, I> {
  /** Schema the success value is encoded through; see `runEffect`. */
  readonly response: Schema.Codec<A, I>
  /** Status of a successful response. Defaults to `200`. */
  readonly status?: number
}

interface WithParams<P, PI> {
  readonly params: Schema.Codec<P, PI>
}

interface WithBody<B, BI> {
  readonly body: Schema.Codec<B, BI>
}

type Program<A, E extends AppError> = Effect.Effect<A, E, HttpEnv>

/**
 * Declares an endpoint: what it reads, what it returns, and the Effect that
 * connects them. The helper owns the plumbing every handler used to repeat —
 * read the body, decode router params and body with their schemas, run the
 * program, encode the response — so a handler states only its contract and its
 * logic, and `run` receives exactly the inputs it declared.
 *
 * Malformed JSON never reaches the program: `readBody` rejects it with h3's own
 * 400, which the app-level error hook renders in the common error shape.
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
export function defineHandler<A, I, E extends AppError, P, PI, B, BI>(
  spec: HandlerBase<A, I> &
    WithParams<P, PI> &
    WithBody<B, BI> & { readonly run: (input: { params: P; body: B }) => Program<A, E> }
): (event: H3Event) => Promise<unknown>
export function defineHandler<A, I, E extends AppError, P, PI>(
  spec: HandlerBase<A, I> &
    WithParams<P, PI> & { readonly run: (input: { params: P }) => Program<A, E> }
): (event: H3Event) => Promise<unknown>
export function defineHandler<A, I, E extends AppError, B, BI>(
  spec: HandlerBase<A, I> &
    WithBody<B, BI> & { readonly run: (input: { body: B }) => Program<A, E> }
): (event: H3Event) => Promise<unknown>
export function defineHandler<A, I, E extends AppError>(
  spec: HandlerBase<A, I> & { readonly run: () => Program<A, E> }
): (event: H3Event) => Promise<unknown>
export function defineHandler(
  spec: HandlerBase<unknown, unknown> & {
    readonly params?: Schema.Codec<unknown, unknown>
    readonly body?: Schema.Codec<unknown, unknown>
    readonly run: (input: { params: unknown; body: unknown }) => Program<unknown, AppError>
  }
): (event: H3Event) => Promise<unknown> {
  return async (event) => {
    const rawBody = spec.body === undefined ? undefined : await readBody(event)

    return runEffect(
      event,
      Effect.gen(function* () {
        const params =
          spec.params === undefined ? undefined : yield* decode(spec.params)(getRouterParams(event))
        const body = spec.body === undefined ? undefined : yield* decode(spec.body)(rawBody)
        return yield* spec.run({ params, body })
      }),
      spec.status === undefined
        ? { response: spec.response }
        : { response: spec.response, successStatus: spec.status }
    )
  }
}
