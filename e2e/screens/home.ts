import type { Page } from 'playwright'

/** The front page. */
export class HomeScreen {
  constructor(private readonly page: Page) {}

  readonly open = () => this.page.goto('/')
  readonly heading = () => this.page.getByRole('heading', { name: 'edgy' })
  readonly browseUsers = () => this.page.getByRole('link', { name: 'Browse the users' })
}
