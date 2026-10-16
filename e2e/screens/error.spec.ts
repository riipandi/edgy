import { expect, test } from '@playwright/test'
import { ErrorScreen } from '../fixtures/error.ts'
import paths from '../test-data/paths.json' with { type: 'json' }
import { expectCleanLoad } from '../utils/policy.ts'

test('answers an unknown page with HTML and an unknown API path with JSON', async ({ page }) => {
  const screen = new ErrorScreen(page)
  const response = await screen.open(paths.missingPage)
  expect(response?.status()).toBe(404)
  expect(response?.headers()['content-type']).toContain('text/html')
  await expect(screen.status()).toHaveText('404')

  const api = await screen.api(paths.missingApi)
  expect(api.status()).toBe(404)
  expect(api.headers()['content-type']).toContain('application/json')
})

test('breaks no policy and logs no error', async ({ page }) => {
  await expectCleanLoad(page, paths.missingPage)
})
