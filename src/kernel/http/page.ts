import { Cause, type Effect, Exit, Option } from 'effect'
import { type H3Event, HTTPError } from 'h3'
import type { AppError } from '../errors.ts'
import { rendererlessTemplate, type HtmlTemplate, htmlResponse } from './html_response.ts'
import { runProgram } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** An error as h3 raises it, which the app's error hook renders (HTML for a page). */
const refused = (error: AppError): HTTPError =>
  new HTTPError({ status: error.status, message: error.clientMessage })

/** The placeholder a page handler carries until the Solid renderer lands (plan phase 2). */
export const noRendererYet = (): Promise<{ readonly default: never }> =>
  Promise.reject(new Error('No page renderer yet (plan-20261018_0105 phase 2)'))

/**
 * Declares an HTML page: the template that renders it. The renderer is Solid (added by its phase
 * of plan-20261018_0105); until then pages answer 503 from `htmlResponse`. The program shape
 * (timeout, cancellation, tracing, `?nocache=true`, `X-Cache`) stays as it is.
 *
 * A failure is thrown as an `HTTPError` for the app's error hook to render.
 *
 * The template loads per request: a static import would make every module that mentions a page
 * unloadable outside Vite, and in development a fresh `import()` picks up an edited template.
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
      let template: HtmlTemplate<A>
      try {
        template = (await spec.template()).default
      } catch {
        // No renderer wired yet (the plan's window between phases): the page answers 503 with
        // the page policy instead of failing the request.
        return htmlResponse(event, rendererlessTemplate, outcome.value, {
          status: 503,
          headers: event.res.headers
        })
      }
      return htmlResponse(event, template, outcome.value, { headers: event.res.headers })
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      return new Response(null, { status: CLIENT_CLOSED_REQUEST })
    }
    const failure = Cause.findErrorOption(exit.cause)
    throw Option.isSome(failure) ? refused(failure.value) : new HTTPError({ status: 500 })
  }
