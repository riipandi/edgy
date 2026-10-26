import { useLocation } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as navbar } from '#/resources/styles/element/navbar.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import { paths } from '#/router.ts'

const links = [
  { href: () => paths(), label: 'Home' },
  { href: () => paths.users(), label: 'Users' }
]

// Shared app-shell navigation. Requires the router context, so render it
// inside route components (the (app) layout or a page), not above <Router>.
export default function Navbar() {
  return (
    <nav {...sx(navbar.nav)}>
      <For each={links}>{(link) => <NavbarLink href={link.href()} label={link.label} />}</For>
    </nav>
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
