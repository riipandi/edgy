import { useLocation } from '@tanstack/react-router'
import { paths } from '#/paths.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as navbar } from '#/resources/styles/element/navbar.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

const links = [
  { href: paths.home(), label: 'Home' },
  { href: paths.users(), label: 'Users' }
]

// Shared app-shell navigation. useLocation needs the router context, so
// render it inside route components (the _app layout or a page), not above
// the router factory.
export default function Navbar() {
  return (
    <nav {...sx(navbar.nav)}>
      {links.map((link) => (
        <NavbarLink key={link.href} href={link.href} label={link.label} />
      ))}
    </nav>
  )
}

function NavbarLink(props: { href: string; label: string }) {
  const location = useLocation()
  const active = props.href !== '/' && location.pathname.startsWith(props.href)
  return (
    <a
      {...sx(navbar.link, active ? navbar.linkActive : null, fx.focusable)}
      aria-current={active ? 'page' : undefined}
      href={props.href}
    >
      {props.label}
    </a>
  )
}
