import { expect, test } from '../../fixtures/test.ts'
import { unknownUser, users } from '../../testdata/users.ts'

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

  test('shows the fallback for an unknown id', async ({ user }) => {
    await user.open(unknownUser.id)

    await expect(user.page).toHaveTitle(`User ${unknownUser.id} - Solid App`)
    await expect(user.name()).toHaveText(unknownUser.name)
  })

  test('returns home from a profile', async ({ user, home }) => {
    await user.open(users[2].id)
    await user.homeLink().click()

    await expect(home.page).toHaveURL(/\/$/)
    await expect(home.heading()).toBeVisible()
  })
})
