import type { H3Event } from 'h3'

/** The part of a compiled `.marko` template an HTML response uses. */
export interface HtmlTemplate<Input> {
  render(input: Marko.TemplateInput<Input>): Marko.RenderedTemplate
}

/**
 * Content-Security-Policy of an HTML response. Marko's one inline script per page is allowed by
 * `nonce` only. Dev mode widens `style-src` and `connect-src`, because Vite injects styles and
 * opens a hot-reload socket there, and nowhere else.
 */
export const contentSecurityPolicy = (nonce: string, dev: boolean): string =>
  [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

const newNonce = (): string => btoa(crypto.randomUUID())

/**
 * Streams a template as the response. Pages pass `event.res.headers`: h3 merges those over a
 * returned `Response`, so the page's policy is not overridden by the API's. Error pages pass a
 * copy of `errHeaders`, which keeps the request id, CORS and rate-limit headers.
 *
 * Never cached by a shared cache: the nonce is per response.
 */
export const htmlResponse = <Input extends object>(
  event: H3Event,
  template: HtmlTemplate<Input>,
  input: Input,
  options: { readonly status?: number; readonly headers: Headers }
): Response => {
  const nonce = newNonce()
  const body = template
    .render({ ...input, $global: { signal: event.req.signal, cspNonce: nonce } })
    .toReadable()

  const { headers } = options
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'private, no-cache')
  headers.set(
    'content-security-policy',
    contentSecurityPolicy(nonce, event.context.development === true)
  )
  return new Response(body, { status: options.status ?? 200, headers })
}
