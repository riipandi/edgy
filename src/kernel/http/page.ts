import { Cause, type Effect, Exit, Option } from 'effect'
import { type H3Event, HTTPError } from 'h3'
import type { AppError } from '../errors.ts'
import { clientManifest, type ClientEntry } from './client_manifest.ts'
import { htmlResponse, type SolidTemplate } from './html_response.ts'
import { runProgram } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** An error as h3 raises it, which the app's error hook renders (HTML for a page). */
const refused = (error: AppError): HTTPError =>
  new HTTPError({ status: error.status, message: error.clientMessage })

/**
 * The page's built browser entries from the manifest — the module script first, its stylesheets
 * after. Empty in development, where Vite injects its own scripts into the page.
 */
const pageScripts = (): readonly string[] => {
  const entry: ClientEntry | undefined = clientManifest['app-entry']
  return entry === undefined ? [] : [entry.script, ...entry.styles]
}

/**
 * Declares an HTML page: an Effect that loads what the page shows, and the Solid component that
 * renders it. The component receives the loaded data as its props, plus the request URL and the
 * page's built assets (the manifest entry of the browser build's `app-entry`), so the router
 * inside matches the request and hydration links the right files. The program runs like an API
 * endpoint's (timeout, cancellation, tracing, `?nocache=true`, `X-Cache`); only the answer
 * differs. The component streams, so the head flushes before slow parts resolve.
 *
 * A failure is thrown as an `HTTPError` for the app's error hook to render.
 *
 * The component loads per request: a static import would make every module that mentions a page
 * unloadable outside Vite, and in development a fresh `import()` picks up an edited page.
 */
/**
 * The page module loads the file-routes manifest itself (`loadRoutes`); awaiting it here would
 * double-load per request, so the module's own promise is the sync point.
 */
const routesReady = async (template: object): Promise<void> => {
  await (template as { routesReady?: () => Promise<void> }).routesReady?.()
}

export const definePageHandler =
  <A extends object, E extends AppError>(spec: {
    readonly load: (event: H3Event) => Effect.Effect<A, E, HttpEnv>
    readonly template: () => Promise<{
      readonly default: SolidTemplate<A & { url: string; scripts: readonly string[] }>
    }>
  }) =>
  async (event: H3Event): Promise<Response> => {
    const exit = await runProgram(event, spec.load(event), 200)

    if (Exit.isSuccess(exit)) {
      const outcome = exit.value
      if (outcome.kind === 'refused') throw refused(outcome.error)
      const page = await spec.template()
      await routesReady(page)
      return htmlResponse(
        event,
        page.default,
        { ...outcome.value, url: event.req.url, scripts: pageScripts() },
        { headers: event.res.headers }
      )
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      return new Response(null, { status: CLIENT_CLOSED_REQUEST })
    }
    const failure = Cause.findErrorOption(exit.cause)
    throw Option.isSome(failure) ? refused(failure.value) : new HTTPError({ status: 500 })
  }
