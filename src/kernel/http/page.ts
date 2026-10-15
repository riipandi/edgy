import { Effect, Exit } from 'effect'
import type { H3Event } from 'h3'
import type { AppError } from '../errors.ts'
import { devServer } from './dev_server.ts'
import type { ApiError } from './envelope.ts'
import { failure, refusal, runProgram } from './responder.ts'
import type { HttpEnv } from './runtime.ts'

/** The part of a compiled `.marko` template a page handler uses. */
export interface PageTemplate<Input> {
  render(input: Marko.TemplateInput<Input>): Marko.RenderedTemplate
}

/**
 * Content-Security-Policy of a page. The API answers `default-src 'none'`; a page needs its own
 * scripts and styles, and nothing else. Marko writes one inline script per page (the resume
 * data), which is allowed by `nonce` and by nothing broader.
 *
 * Under `pnpm dev` Vite injects styles at runtime and opens a socket for hot reload, so those two
 * directives widen there and only there.
 */
const contentSecurityPolicy = (nonce: string, dev: boolean): string =>
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
 * Declares an HTML page: an Effect that loads what the page shows, and the Marko template that
 * renders it.
 *
 * The program runs exactly like an API endpoint's (request timeout, cancellation on disconnect,
 * tracing, error reporting, `?nocache=true`, `X-Cache`), through `runProgram`; only the answer
 * differs. The template streams: the head is flushed before slower parts of the page resolve.
 *
 * A failure is not rendered as a page: it is answered in the API's error envelope, the same body
 * (code, retryable, redacted detail, trace id) an API client sees. An HTML error page is a product
 * decision that is not made yet.
 *
 * `template` is loaded per request on purpose: a static import would make every module that
 * mentions a page unloadable outside Vite (the CLI, `pnpm app migrate:up`), and in development a
 * fresh `import()` is what picks up an edited template.
 */
export const definePageHandler =
  <A extends object, E extends AppError>(spec: {
    readonly load: (event: H3Event) => Effect.Effect<A, E, HttpEnv>
    readonly template: () => Promise<{ readonly default: PageTemplate<A> }>
  }) =>
  async (event: H3Event): Promise<Response | ApiError> => {
    const exit = await runProgram(event, spec.load(event), 200)

    if (Exit.isSuccess(exit)) {
      const outcome = exit.value
      if (outcome.kind === 'refused') return refusal(event, outcome.error)
      const { default: template } = await spec.template()
      const nonce = newNonce()
      const body = template
        .render({
          ...outcome.value,
          $global: { signal: event.req.signal, cspNonce: nonce }
        })
        .toReadable()

      event.res.headers.set('content-type', 'text/html; charset=utf-8')
      // The nonce is per response, so a shared cache must not keep one.
      event.res.headers.set('cache-control', 'private, no-cache')
      event.res.headers.set(
        'content-security-policy',
        contentSecurityPolicy(nonce, devServer() !== undefined)
      )
      return new Response(body, { headers: event.res.headers })
    }

    return failure(event, exit.cause)
  }
