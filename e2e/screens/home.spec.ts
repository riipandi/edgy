import { expect, test } from '@playwright/test'
import { HomeScreen } from '../fixtures/home.ts'
import paths from '../test-data/paths.json' with { type: 'json' }
import { expectCleanLoad, watchPolicy } from '../utils/policy.ts'

test('links the front page to the users', async ({ page }) => {
  const home = new HomeScreen(page)
  await home.open()
  await expect(home.heading()).toBeVisible()
  await home.browseUsers().click()
  await expect(page).toHaveURL(/\/users$/)
})

test('breaks no policy and logs no error', async ({ page }) => {
  await expectCleanLoad(page, paths.home)
})

test('blocks a script the nonce does not cover', async ({ page }) => {
  const policy = await watchPolicy(page)
  await new HomeScreen(page).open()
  const result = await policy.injectInline()

  expect(result.ran).toBe(false)
  expect(result.violations.some((entry) => entry.startsWith('script-src'))).toBe(true)
})
