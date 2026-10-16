import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { UsersScreen } from '../fixtures/users.ts'

const stylesheet = path.resolve(import.meta.dirname, '../../app/styles/users.css.ts')
const original = readFileSync(stylesheet, 'utf8')
const MUTED = "color: vars.color.muted, fontSize: '0.875rem'"

test.describe.configure({ mode: 'serial' })
test.afterEach(() => writeFileSync(stylesheet, original))

test('a style edit reaches the open page without the visitor reloading it', async ({ page }) => {
  expect(original).toContain(MUTED)
  const users = new UsersScreen(page)
  await users.open()
  const color = () => users.summaryText().evaluate((el) => getComputedStyle(el).color)
  const before = await color()

  writeFileSync(stylesheet, original.replace(MUTED, "color: 'rgb(1, 2, 3)', fontSize: '0.875rem'"))

  await expect.poll(color).toBe('rgb(1, 2, 3)')
  expect(before).not.toBe('rgb(1, 2, 3)')
})
