import { routes } from '../../utils/routes.ts'
import { AppScreen } from '../shared/app.screen.ts'

export class UserScreen extends AppScreen {
  async open(id: string) {
    return this.page.goto(routes.user(id))
  }

  name() {
    return this.page.getByRole('heading', { level: 2 })
  }

  nextLink() {
    return this.page.getByRole('link', { name: 'All users' })
  }
}
