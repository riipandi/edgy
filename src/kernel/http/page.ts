import { Cause, type Effect, Exit, Option } from 'effect'
import { type H3Event, HTTPError } from 'h3'
import type { AppError } from '../errors.ts'
import { type HtmlTemplate, htmlResponse } from './html_response.ts'
import { runProgram } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** An error as h3 raises it, which the app's error hook renders (HTML for a page). */
const refused = (error: AppError): HTTPError =>
  new HTTPError({ status: error.status, message: error.clientMessage })

/**
 * Declares an HTML page: an Effect that loads what the page shows, and the Marko template that
 * renders it.
 *
 * The program runs exactly like an API endpoint's (request timeout, cancellation on disconnect,
 * tracing, error reporting, `?nocache=true`, `X-Cache`), through `runProgram`; only the answer
 * differs. The template streams: the head is flushed before slower parts of the page resolve.
 *
 * A failure is thrown as an `HTTPError` and answered by the app's error hook, which renders an
 * error page for a path outside `/api` (`error_page.ts`) and the API's error envelope inside it.
 *
 * `template` is loaded per request on purpose: a static import would make every module that
 * mentions a page unloadable outside Vite (the CLI, `pnpm app migrate:up`), and in development a
 * fresh `import()` is what picks up an edited template.
 */
export const definePageHandler =
  <A extends object, E extends AppError>(spec: {
    readonly load: (event: H3Event) => Effect.Effect<A, E, HttpEnv>
    readonly template: () => Promise<{ readonly default: HtmlTemplate<A> }>
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
