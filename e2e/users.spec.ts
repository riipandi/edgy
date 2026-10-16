import { expect, it } from 'vitest'
import { describeBrowsers } from './fixtures/browsers.ts'
import { UsersScreen } from './screens/users.ts'

describeBrowsers(({ open }) => {
  it('applies the stylesheet', async () => {
    const users = new UsersScreen(await open())
    await users.open()
    // A page whose stylesheet failed to load keeps the browser's default serif face.
    const family = await users.heading().evaluate((el) => getComputedStyle(el).fontFamily)
    expect(family).not.toMatch(/^"?Times/i)
  })

  it('hydrates the list: the filter narrows it in the browser', async () => {
    const users = new UsersScreen(await open())
    await users.open()
    await expect.poll(() => users.rows().count()).toBe(3)
    expect(await users.summary(3, 3).isVisible()).toBe(true)

    await users.filter().fill('grace')
    await expect.poll(() => users.rows().count()).toBe(1)
    expect(await users.rows().first().innerText()).toContain('Grace Hopper')
    expect(await users.summary(1, 3).isVisible()).toBe(true)
  })

  it('follows the cursor to the next page and back to the start', async () => {
    const page = await open()
    const users = new UsersScreen(page)
    await users.open('?limit=2')
    expect(await users.summary(2, 2).isVisible()).toBe(true)
    expect(await users.backToStart().count()).toBe(0)

    await users.next().click()
    await page.waitForURL(/cursor=/)
    expect(await users.summary(1, 1).isVisible()).toBe(true)
    expect(await users.next().count()).toBe(0)

    await users.pagerLink().click()
    await page.waitForURL((url) => !url.search.includes('cursor='))
    expect(await users.summary(2, 2).isVisible()).toBe(true)
  })
})
