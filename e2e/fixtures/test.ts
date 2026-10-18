import { test as base } from '@playwright/test'
import { HomeScreen } from '../screens/home/home.screen.ts'
import { NotFoundScreen } from '../screens/not-found/not-found.screen.ts'
import { UserScreen } from '../screens/users/user.screen.ts'
import { UsersScreen } from '../screens/users/users.screen.ts'

type Screens = {
  home: HomeScreen
  users: UsersScreen
  user: UserScreen
  notFound: NotFoundScreen
}

export const test = base.extend<Screens>({
  home: async ({ page }, use) => {
    await use(new HomeScreen(page))
  },
  users: async ({ page }, use) => {
    await use(new UsersScreen(page))
  },
  user: async ({ page }, use) => {
    await use(new UserScreen(page))
  },
  notFound: async ({ page }, use) => {
    await use(new NotFoundScreen(page))
  }
})

export { expect } from '@playwright/test'
