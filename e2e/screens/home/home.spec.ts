import { expect, test } from '../../fixtures/test.ts'

test.describe('home', () => {
  test('shows the landing page and increments the counter', async ({ home }) => {
    await home.open()

    await expect(home.page).toHaveTitle('Home - Solid App')
    await expect(home.logo()).toBeVisible()
    await expect(home.heading()).toBeVisible()
    await expect(home.counter()).toHaveText('Clicks: 0')
    await expect(home.learnLink()).toHaveAttribute('href', 'https://v2.solidjs.com/')

    await home.counter().click()
    await expect(home.counter()).toHaveText('Clicks: 1')

    await home.counter().click()
    await expect(home.counter()).toHaveText('Clicks: 2')
  })

  test('navigates to the users list from the shell', async ({ home, users }) => {
    await home.open()
    await home.usersLink().click()

    await expect(users.page).toHaveURL(/\/users$/)
    await expect(users.heading()).toBeVisible()
  })
})
