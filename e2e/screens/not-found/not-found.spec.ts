import { expect, test } from '../../fixtures/test.ts'

test.describe('not found', () => {
  test('renders the catch-all page and keeps the shell navigation', async ({ notFound, home }) => {
    await notFound.open()

    await expect(notFound.page).toHaveTitle('Not Found - Edgy')
    await expect(notFound.heading()).toBeVisible()
    await expect(notFound.docsLink()).toHaveAttribute('href', 'https://tanstack.com/start/latest')

    await notFound.homeLink().click()
    await expect(home.heading()).toBeVisible()
  })
})
