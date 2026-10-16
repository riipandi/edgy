import { expect, it } from 'vitest'
import { describeBrowsers } from './fixtures/browsers.ts'
import { watchPolicy } from './fixtures/csp.ts'

describeBrowsers(({ open }) => {
  it.each(['/', '/users', '/no-such-page'])(
    '%s breaks no policy and logs no error',
    async (path) => {
      const page = await open()
      const policy = await watchPolicy(page)
      const errors: string[] = []
      page.on('console', (message) => {
        // The browser reports the 404 of the error page itself as a console error.
        if (message.type() === 'error' && !message.text().includes('404'))
          errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))

      await page.goto(path)
      await page.waitForLoadState('networkidle')

      expect(await policy.violations()).toEqual([])
      expect(errors).toEqual([])
    }
  )

  it('blocks a script the nonce does not cover', async () => {
    const page = await open()
    const policy = await watchPolicy(page)
    await page.goto('/users')
    const result = await policy.injectInline()

    expect(result.ran).toBe(false)
    expect(result.violations.some((entry) => entry.startsWith('script-src'))).toBe(true)
  })
})
