import { describe, expect, it } from '@effect/vitest'
import type { H3Event } from 'h3'
import { htmlResponse } from './html_response.ts'
import { TestPage } from './test_page.tsx'

const makeEvent = (development = false): H3Event =>
  ({
    req: { signal: new AbortController().signal },
    context: { development },
    res: { headers: new Headers(), errHeaders: new Headers() }
  }) as unknown as H3Event

describe('htmlResponse with a Solid page', () => {
  it('streams the rendered component as the response body', async () => {
    const response = htmlResponse(
      makeEvent(),
      TestPage,
      { title: 'Solid', items: ['one', 'two'] },
      {
        headers: new Headers()
      }
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<h1>Solid</h1>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('carries the page policy, with no nonce while no inline script exists', async () => {
    const headers = new Headers()
    const response = htmlResponse(makeEvent(), TestPage, { title: 'S', items: [] }, { headers })
    const html = await response.text()
    const policy = headers.get('content-security-policy') ?? ''

    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).not.toContain('nonce-')
    expect(policy).not.toContain('unsafe-inline')
    expect(headers.get('cache-control')).toBe('private, no-cache')
    expect(html).toContain('<h1>S</h1>')
  })

  it('widens the policy only in development', async () => {
    const headers = new Headers()
    const response = htmlResponse(makeEvent(true), TestPage, { title: 'S', items: [] }, { headers })
    await response.text()
    const policy = headers.get('content-security-policy') ?? ''

    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("connect-src 'self' ws: wss:")
  })

  it('answers 503 when the page throws before its first flush', async () => {
    const Broken = () => {
      throw new Error('placeholder failure')
    }
    const response = htmlResponse(makeEvent(), Broken, {}, { headers: new Headers() })
    const html = await response.text()

    expect(response.status).toBe(503)
    expect(html).not.toContain('placeholder failure')
  })

  it('tears the render down when the request aborts', async () => {
    const controller = new AbortController()
    const messages: string[] = []
    const consoleError = console.error
    const consoleWarn = console.warn
    const capture = (...args: unknown[]) => messages.push(args.map(String).join(' '))
    console.error = capture
    console.warn = capture
    try {
      const event = makeEvent()
      const abortable = {
        req: { signal: controller.signal },
        context: event.context,
        res: event.res
      } as unknown as H3Event
      const response = htmlResponse(
        abortable,
        TestPage,
        { title: 'S', items: [] },
        {
          headers: new Headers()
        }
      )
      const reader = response.body!.getReader()
      controller.abort()
      // The render reports its teardown (SSR_STREAM_ABANDONED, severity warn) and Solid
      // leaves the stream close to the cancelled consumer side; cancelling settles it.
      await reader.cancel()
      expect(messages.some((message) => message.includes('SSR_STREAM_ABANDONED'))).toBe(true)
    } finally {
      console.error = consoleError
      console.warn = consoleWarn
    }
  })
})
