import type { Page } from '@playwright/test'

/** The HTML error page, and the JSON error an API path answers instead. */
export class ErrorScreen {
  constructor(private readonly page: Page) {}

  readonly open = (path: string) => this.page.goto(path)
  readonly status = () => this.page.getByText(/^\d{3}$/)
  readonly api = (path: string) => this.page.request.get(path)
}
