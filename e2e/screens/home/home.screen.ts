import { routes } from '../../utils/routes.ts'
import { AppScreen } from '../shared/app.screen.ts'

export class HomeScreen extends AppScreen {
  async open() {
    await this.page.goto(routes.home)
  }

  eyebrow() {
    return this.page.getByText('TanStack Start Base Template')
  }

  heading() {
    return this.page.getByRole('heading', { name: 'Start simple, ship quickly.' })
  }

  usersCta() {
    // The nav carries a Users link too; the CTA lives in the hero section.
    return this.page.getByRole('main').getByRole('link', { name: 'Users', exact: true })
  }

  docsLink() {
    return this.page.getByRole('link', { name: 'Docs' })
  }

  featureCard(title: string) {
    return this.page.getByRole('heading', { name: title, level: 2 })
  }

  quickStart() {
    return this.page.getByText('Quick Start')
  }
}
