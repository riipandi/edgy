import { expect, test } from '../../fixtures/test.ts'
import { unknownUser, users } from '../../testdata/users.ts'
import { routes } from '../../utils/routes.ts'

test.describe('user profile', () => {
  test('walks back to the users list', async ({ user, users: usersScreen }) => {
    const first = users[0]
    await user.open(first.id)

    await user.nextLink().click()

    await expect(usersScreen.page).toHaveURL(new RegExp(`${'/users'}$`))
    await expect(usersScreen.heading()).toBeVisible()
    for (const record of users) {
      await expect(usersScreen.userLink(record.name)).toHaveAttribute('href', `/users/${record.id}`)
    }
  })

  test('answers 404 with the not-found copy for an unknown id', async ({ user }) => {
    const response = await user.open(unknownUser.id)

    expect(response?.status()).toBe(404)
    await expect(user.page).toHaveTitle('User not found')
    await expect(user.name()).toHaveText('User not found')
  })

  test('reports the read cache status as x-cache on the detail page', async ({ user }) => {
    const response = await user.open(users[1].id)
    expect(['hit', 'miss']).toContain(await response?.headerValue('x-cache'))

    const bypass = await user.page.goto(`${routes.user(users[2].id)}?nocache=1`)
    expect(await bypass?.headerValue('x-cache')).toBe('bypass')
  })

  test('returns home from a profile', async ({ user, home }) => {
    await user.open(users[2].id)
    await user.homeLink().click()

    await expect(home.page).toHaveURL(/\/$/)
    await expect(home.heading()).toBeVisible()
  })
})
