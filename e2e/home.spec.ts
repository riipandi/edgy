import { expect, it } from 'vitest'
import { describeBrowsers } from './fixtures/browsers.ts'
import { HomeScreen } from './screens/home.ts'

describeBrowsers(({ open }) => {
  it('links the front page to the users', async () => {
    const page = await open()
    const home = new HomeScreen(page)
    await home.open()
    await expect.poll(() => home.heading().isVisible()).toBe(true)
    await home.browseUsers().click()
    await page.waitForURL('**/users')
  })
})
