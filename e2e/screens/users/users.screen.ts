import { routes } from '../../utils/routes.ts'
import { AppScreen } from '../shared/app.screen.ts'

export class UsersScreen extends AppScreen {
  async open() {
    await this.page.goto(routes.users)
  }

  heading() {
    return this.page.getByRole('heading', { name: 'Users', level: 1 })
  }

  userLink(name: string) {
    return this.page.getByRole('link', { name, exact: true })
  }
}
