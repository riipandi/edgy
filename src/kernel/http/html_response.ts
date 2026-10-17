import type { H3Event } from 'h3'

/**
 * The seam a page renderer plugs into (plan-20261018_0105): phase 1 removed Marko, phase 2 lands
 * the Solid renderer here. Until then no page can render, so a caller reaching this path is a
 * wiring mistake, not a user-facing answer.
 */
export interface HtmlTemplate<Input> {
  render(input: Input): { toReadable(): ReadableStream }
}

/** The placeholder a handler carries while no renderer is wired (the plan's phase window). */
export const rendererlessTemplate: HtmlTemplate<never> = {
  render: () => ({
    toReadable: () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.close()
        }
      })
  })
}

/**
 * Content-Security-Policy of an HTML response. Dev mode widens `style-src` and `connect-src`,
 * because Vite injects styles and opens a hot-reload socket there, and nowhere else.
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

/**
 * Streams a template as the response. Pages pass `event.res.headers`: h3 merges those over a
 * returned `Response`, so the page's policy is not overridden by the API's. Error pages pass a
 * copy of `errHeaders`, which keeps the request id, CORS and rate-limit headers.
 */
export const htmlResponse = <Input extends object>(
  event: H3Event,
  _template: HtmlTemplate<Input>,
  _input: Input,
  options: { readonly status?: number; readonly headers: Headers }
): Response => {
  const { headers } = options
  // For a response of status 400+, h3 merges `errHeaders` over the returned headers, so the page
  // policy must land there too or the middleware's bare JSON policy wins.
  const errHeaders = event.res.errHeaders
  for (const target of new Set([headers, errHeaders])) {
    target.set('content-type', 'text/html; charset=utf-8')
    target.set('cache-control', 'private, no-cache')
    target.set('content-security-policy', contentSecurityPolicy(event.context.development === true))
  }
  return new Response('Page rendering is not wired yet', {
    status: options.status ?? 503,
    headers
  })
}
