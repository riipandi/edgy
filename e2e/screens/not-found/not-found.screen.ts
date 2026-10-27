import { routes } from '../../utils/routes.ts'
import { AppScreen } from '../shared/app.screen.ts'

export class NotFoundScreen extends AppScreen {
  async open(path: string = routes.missing) {
    await this.page.goto(path)
  }

  heading() {
    return this.page.getByRole('heading', { name: 'Page Not Found' })
  }

  docsLink() {
    return this.page.getByRole('link', { name: 'tanstack.com/start' })
  }
}
