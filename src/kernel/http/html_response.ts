import { createRequestEvent, renderToStream } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import type { H3Event } from 'h3'
import { createComponent, type ValidComponent } from 'solid-js'

/**
 * A Solid page component: it receives the handler's loaded data as its props. Phase 4 of
 * plan-20261018_0105 moves page data to `/rpc`; until then a page's `load` output still arrives
 * as props.
 */
export type SolidTemplate<Input> = (props: Input) => unknown

/**
 * Renders a Solid page through `renderToStream` (the request's abort signal tears the render
 * down on a client disconnect) and streams it as the response. Pages pass `event.res.headers`:
 * h3 merges those over a returned `Response`, so the page's policy is not overridden by the
 * API's. Error pages pass a copy of `errHeaders`, which keeps the request id, CORS and
 * rate-limit headers.
 *
 * The Solid path emits no inline script (hydration loads as a module from `script-src 'self'`),
 * so the response carries no nonce and may be cached where its data allows.
 *
 * A page that throws before its shell streams out answers 503 with the page policy instead of
 * the failure — the same contract this renderer holds for a wired renderer: a page error is a
 * page answer.
 */
export const htmlResponse = <Input extends object>(
  event: H3Event,
  template: SolidTemplate<Input>,
  input: Input,
  options: { readonly status?: number; readonly headers: Headers }
): Response => {
  const { headers } = options
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('content-security-policy', contentSecurityPolicy(event.context.development === true))
  headers.set('cache-control', 'private, no-cache')
  // For a response of status 400+, h3 merges `errHeaders` over the returned headers, so the
  // page policy must land there too or the middleware's bare JSON policy wins.
  const errHeaders = event.res.errHeaders
  errHeaders.set('content-type', 'text/html; charset=utf-8')
  errHeaders.set('content-security-policy', headers.get('content-security-policy')!)
  errHeaders.set('cache-control', 'private, no-cache')

  // The request event is how the router inside locates the render (`getRequestEvent`); the
  // `url` prop of the page component is the fallback. A failure before the first flush escapes
  // to the caller: the page pipeline turns it into the error page, and a page whose own shell
  // throws is exactly what that page is for.
  return new Response(
    provideRequestEvent(
      createRequestEvent(event.req),
      () =>
        renderToStream(
          () =>
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the two shapes agree at every call site
            createComponent(template as ValidComponent, input),
          { signal: event.req.signal }
        ).readable
    ),
    { status: options.status ?? 200, headers }
  )
}

/**
 * Content-Security-Policy of an HTML response. Solid hydrates from an external module script, so
 * no nonce is needed. Dev mode widens `style-src` and `connect-src`, because Vite injects styles
 * and opens a hot-reload socket there, and nowhere else.
 */
const contentSecurityPolicy = (dev: boolean): string =>
  [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
