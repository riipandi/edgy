import { expect, test } from '../../fixtures/test.ts'

const featureTitles = [
  'File-Based Routing',
  'Effect API Server',
  'Solid 2 Reactivity',
  'StyleX Styling'
]

test.describe('home', () => {
  test('shows the landing hero, feature cards, and quick start', async ({ home }) => {
    await home.open()

    await expect(home.page).toHaveTitle('Home - Solid App')
    await expect(home.eyebrow()).toBeVisible()
    await expect(home.heading()).toBeVisible()
    await expect(home.usersCta()).toHaveAttribute('href', '/users')
    await expect(home.docsLink()).toHaveAttribute('href', 'https://v2.solidjs.com/')

    for (const title of featureTitles) {
      await expect(home.featureCard(title)).toBeVisible()
    }

    await expect(home.quickStart()).toBeVisible()
  })

  test('navigates to the users list from the hero CTA', async ({ home, users }) => {
    await home.open()
    await home.usersCta().click()

    await expect(users.page).toHaveURL(/\/users$/)
    await expect(users.heading()).toBeVisible()
  })
})
