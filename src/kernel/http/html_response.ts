import type { H3Event } from 'h3'
import { devServer } from './dev_server.ts'

/** The part of a compiled `.marko` template an HTML response uses. */
export interface HtmlTemplate<Input> {
  render(input: Marko.TemplateInput<Input>): Marko.RenderedTemplate
}

/**
 * Content-Security-Policy of an HTML response. The API answers `default-src 'none'`; a page needs
 * its own scripts and styles, and nothing else. Marko writes one inline script per page (the
 * resume data), which is allowed by `nonce` and by nothing broader.
 *
 * Under `pnpm dev` Vite injects styles at runtime and opens a socket for hot reload, so those two
 * directives widen there and only there.
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
 * Streams a template as the response. `headers` is where the response's headers start and are
 * written to: a page passes `event.res.headers` (h3 merges those over a returned `Response`, so the
 * policy must be set there or the fixed API one would win), an error page a copy of the
 * `errHeaders` h3 would have built the error from, so the request id, CORS and the rate-limit
 * headers survive either way.
 *
 * The response is never cached by a shared cache: the nonce is per response.
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
  headers.set('content-security-policy', contentSecurityPolicy(nonce, devServer() !== undefined))
  return new Response(body, { status: options.status ?? 200, headers })
}
