import { expect, it } from 'vitest'
import { describeBrowsers } from './fixtures/browsers.ts'
import { ErrorScreen } from './screens/error.ts'

describeBrowsers(({ open }) => {
  it('answers an unknown page with HTML and an unknown API path with JSON', async () => {
    const screen = new ErrorScreen(await open())
    const response = await screen.open('/no-such-page')
    expect(response?.status()).toBe(404)
    expect(response?.headers()['content-type']).toContain('text/html')
    expect(await screen.status().textContent()).toBe('404')

    const api = await screen.api('/api/no-such-path')
    expect(api.status()).toBe(404)
    expect(api.headers()['content-type']).toContain('application/json')
  })
})
