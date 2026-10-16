import type { Page } from 'playwright'

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
