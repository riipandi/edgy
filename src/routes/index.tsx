import { Title } from '@solidjs/meta'
import logo from '../assets/images/logo.svg'
import Counter from '../resources/components/counter'
import Navbar from '../resources/components/navbar'
import { fx } from '../resources/styles/core/utils.stylex'
import { styles as home } from '../resources/styles/pages/home.stylex'
import { sx } from '../resources/styles/props'

export default function RouteComponent() {
  return (
    <>
      <Navbar />
      <main {...sx(fx.main)}>
        <Title>Home - Solid App</Title>
        <img src={logo} alt='Solid logo' {...sx(home.logo)} />
        <h1 {...sx(fx.h1)}>Hello Solid!</h1>
        <p {...sx(home.lead)}>A Vite + Solid 2 + Effect template with StyleX styling.</p>
        <Counter />
        <p {...sx(home.edit)}>
          Edit <code {...sx(home.code)}>src/routes/index.tsx</code> and save to reload.
        </p>
        <a
          {...sx(fx.link, fx.focusable)}
          href='https://v2.solidjs.com/'
          target='_blank'
          rel='noopener noreferrer'
        >
          Learn Solid
        </a>
      </main>
    </>
  )
}
