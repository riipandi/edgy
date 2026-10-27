import { expect, test } from '../../fixtures/test.ts'

test.describe('not found', () => {
  test('renders the catch-all page outside the app shell', async ({ notFound }) => {
    await notFound.open()

    await expect(notFound.page).toHaveTitle('Not Found - Edgy')
    await expect(notFound.heading()).toBeVisible()
    await expect(notFound.docsLink()).toHaveAttribute('href', 'https://tanstack.com/start/latest')
    await expect(notFound.page.getByRole('navigation')).toHaveCount(0)
  })
})
