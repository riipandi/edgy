import { Title } from '@solidjs/meta'
import { useLocation } from '@solidjs/router'
import { For, Loading, Show } from 'solid-js'
import { darkColors } from './resources/styles/core/themes'
import { fx } from './resources/styles/core/utils.stylex'
import { styles as navbar } from './resources/styles/element/navbar.stylex'
import { styles as rootLayout } from './resources/styles/element/root-layout.stylex'
import { sx } from './resources/styles/props'
import { paths, Router } from './router'

const links = [
  { href: () => paths(), label: 'Home' },
  { href: () => paths.users(), label: 'Users' }
]

export default function App() {
  return (
    <div {...sx(rootLayout.root, darkColors)}>
      <Router>
        {(props) => (
          <>
            <Title>Solid App</Title>
            <nav {...sx(navbar.nav)}>
              <For each={links}>
                {(link) => <NavbarLink href={link.href()} label={link.label} />}
              </For>
            </nav>
            <Loading fallback={<main {...sx(fx.main)}>Loading…</main>}>{props.children}</Loading>
          </>
        )}
      </Router>
    </div>
  )
}

function NavbarLink(props: { href: string; label: string }) {
  const location = useLocation()
  return (
    <Show
      when={location.pathname.startsWith(props.href) && props.href !== '/'}
      fallback={
        <a {...sx(navbar.link, fx.focusable)} href={props.href}>
          {props.label}
        </a>
      }
    >
      <a
        {...sx(navbar.link, navbar.linkActive, fx.focusable)}
        aria-current='page'
        href={props.href}
      >
        {props.label}
      </a>
    </Show>
  )
}
