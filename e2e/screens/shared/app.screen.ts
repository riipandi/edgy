import type { Page } from '@playwright/test'

/** Shared shell: the nav rendered by `src/app.tsx` on every route. */
export class AppScreen {
  constructor(readonly page: Page) {}

  homeLink() {
    return this.page.getByRole('navigation').getByRole('link', { name: 'Home' })
  }

  usersLink() {
    return this.page.getByRole('navigation').getByRole('link', { name: 'Users' })
  }
}
