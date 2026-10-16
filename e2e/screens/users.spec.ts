import { expect, test } from '@playwright/test'
import { UsersScreen } from '../fixtures/users.ts'
import paths from '../test-data/paths.json' with { type: 'json' }
import data from '../test-data/users.json' with { type: 'json' }
import { expectCleanLoad } from '../utils/policy.ts'

test('applies the stylesheet', async ({ page }) => {
  const users = new UsersScreen(page)
  await users.open()
  // A page whose stylesheet failed to load keeps the browser's default serif face.
  const family = await users.heading().evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).not.toMatch(/^"?Times/i)
})

test('hydrates the list: the filter narrows it in the browser', async ({ page }) => {
  const users = new UsersScreen(page)
  await users.open()
  await expect(users.rows()).toHaveCount(data.seeded.length)
  await expect(users.summary(data.seeded.length, data.seeded.length)).toBeVisible()

  await users.filter().fill(data.filter.term)
  await expect(users.rows()).toHaveCount(data.filter.matches.length)
  await expect(users.rows().first()).toContainText(data.filter.matches[0] ?? '')
  await expect(users.summary(data.filter.matches.length, data.seeded.length)).toBeVisible()
})

test('follows the cursor to the next page and back to the start', async ({ page }) => {
  const users = new UsersScreen(page)
  const rest = data.seeded.length - data.pageSize
  await users.open(`?limit=${data.pageSize}`)
  await expect(users.summary(data.pageSize, data.pageSize)).toBeVisible()
  await expect(users.backToStart()).toHaveCount(0)

  await users.next().click()
  await expect(page).toHaveURL(/cursor=/)
  await expect(users.summary(rest, rest)).toBeVisible()
  await expect(users.next()).toHaveCount(0)

  await users.pagerLink().click()
  await expect(page).not.toHaveURL(/cursor=/)
  await expect(users.summary(data.pageSize, data.pageSize)).toBeVisible()
})

test('breaks no policy and logs no error', async ({ page }) => {
  await expectCleanLoad(page, paths.users)
})
