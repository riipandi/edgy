import { expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __violations: string[]
    __injected?: boolean
  }
}

/** Records every `securitypolicyviolation` the page raises from its first script on. */
export const watchPolicy = async (page: Page) => {
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  return {
    violations: () => page.evaluate(() => window.__violations),
    /** Adds an inline script with no nonce; `ran` is whether the browser executed it. */
    injectInline: () =>
      page.evaluate(async () => {
        const script = document.createElement('script')
        script.textContent = 'window.__injected = true'
        document.head.append(script)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { ran: window.__injected === true, violations: window.__violations }
      })
  }
}

/** Opens `path` and fails on a policy violation, a console error or an uncaught exception. */
export const expectCleanLoad = async (page: Page, path: string): Promise<void> => {
  const policy = await watchPolicy(page)
  const errors: string[] = []
  page.on('console', (message) => {
    // The browser reports the 404 of the error page itself as a console error.
    if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(path)
  await page.waitForLoadState('networkidle')

  expect(await policy.violations()).toEqual([])
  expect(errors).toEqual([])
}
