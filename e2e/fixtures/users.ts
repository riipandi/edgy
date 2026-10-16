import type { Page } from '@playwright/test'

/** The `/users` page: the list, its filter and its pager. */
export class UsersScreen {
  constructor(private readonly page: Page) {}

  readonly open = (query = '') => this.page.goto(`/users${query}`)
  readonly heading = () => this.page.getByRole('heading', { name: 'Users' })
  readonly summaryText = () => this.page.getByText(/^Showing \d+ of \d+$/)
  readonly rows = () => this.page.getByRole('listitem')
  readonly filter = () => this.page.getByRole('searchbox', { name: 'Filter users' })
  readonly summary = (shown: number, total: number) =>
    this.page.getByText(`Showing ${shown} of ${total}`)
  readonly next = () => this.page.getByRole('link', { name: 'Next' })
  readonly backToStart = () =>
    this.page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'Back to the start' })
  readonly pagerLink = () => this.page.getByRole('navigation', { name: 'Pages' }).getByRole('link')
}
