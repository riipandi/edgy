import { expect, test } from '../../fixtures/test.ts'
import { users } from '../../testdata/users.ts'

test.describe('users', () => {
  test('lists every user and opens their profile', async ({ users: usersScreen, user }) => {
    await usersScreen.open()

    await expect(usersScreen.page).toHaveTitle('Users - Edgy')
    await expect(usersScreen.heading()).toBeVisible()
    await expect(usersScreen.eyebrow()).toBeVisible()

    for (const record of users) {
      await expect(usersScreen.userLink(record.name)).toHaveAttribute('href', `/users/${record.id}`)
    }

    const first = users[0]
    await usersScreen.userLink(first.name).click()

    await expect(user.page).toHaveURL(new RegExp(`/users/${first.id}$`))
    await expect(user.page).toHaveTitle(`User ${first.id} - Edgy`)
    await expect(user.name()).toHaveText(first.name)
    await expect(user.page.getByText(first.email)).toBeVisible()
  })
})
