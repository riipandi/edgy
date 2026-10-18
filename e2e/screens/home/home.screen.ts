import { routes } from '../../utils/routes.ts'
import { AppScreen } from '../shared/app.screen.ts'

export class HomeScreen extends AppScreen {
  async open() {
    await this.page.goto(routes.home)
  }

  heading() {
    return this.page.getByRole('heading', { name: 'Hello Solid!' })
  }

  logo() {
    return this.page.getByRole('img', { name: 'Solid logo' })
  }

  counter() {
    return this.page.getByRole('button', { name: /Clicks:/ })
  }

  learnLink() {
    return this.page.getByRole('link', { name: 'Learn Solid' })
  }
}
