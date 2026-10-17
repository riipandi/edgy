import { Cause, type Effect, Exit, Option } from 'effect'
import { type H3Event, HTTPError } from 'h3'
import type { AppError } from '../errors.ts'
import { htmlResponse, type SolidTemplate } from './html_response.ts'
import { runProgram } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** An error as h3 raises it, which the app's error hook renders (HTML for a page). */
const refused = (error: AppError): HTTPError =>
  new HTTPError({ status: error.status, message: error.clientMessage })

/**
 * Declares an HTML page: an Effect that loads what the page shows, and the Solid component that
 * renders it. The program runs like an API endpoint's (timeout, cancellation, tracing,
 * `?nocache=true`, `X-Cache`); only the answer differs. The component streams, so the head
 * flushes before slow parts resolve. Phase 4 of plan-20261018_0105 moves page data to `/rpc`,
 * which dissolves `load` into the page itself.
 *
 * A failure is thrown as an `HTTPError` for the app's error hook to render.
 *
 * The component loads per request: a static import would make every module that mentions a page
 * unloadable outside Vite, and in development a fresh `import()` picks up an edited page.
 */
export const definePageHandler =
  <A extends object, E extends AppError>(spec: {
    readonly load: (event: H3Event) => Effect.Effect<A, E, HttpEnv>
    readonly template: () => Promise<{ readonly default: SolidTemplate<A> }>
  }) =>
  async (event: H3Event): Promise<Response> => {
    const exit = await runProgram(event, spec.load(event), 200)

    if (Exit.isSuccess(exit)) {
      const outcome = exit.value
      if (outcome.kind === 'refused') throw refused(outcome.error)
      const { default: template } = await spec.template()
      return htmlResponse(event, template, outcome.value, { headers: event.res.headers })
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      return new Response(null, { status: CLIENT_CLOSED_REQUEST })
    }
    const failure = Cause.findErrorOption(exit.cause)
    throw Option.isSome(failure) ? refused(failure.value) : new HTTPError({ status: 500 })
  }
