import { Link, useLocation } from '@tanstack/react-router'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as navbar } from '#/resources/styles/element/navbar.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

const links = [
  { to: '/', label: 'Home' },
  { to: '/users', label: 'Users' }
] as const

// Shared app-shell navigation. useLocation needs the router context, so
// render it inside route components (the (app) layout or a page), not above
// the router factory.
export default function Navbar() {
  return (
    <nav {...sx(navbar.nav)}>
      {links.map((link) => (
        <NavbarLink key={link.to} to={link.to} label={link.label} />
      ))}
    </nav>
  )
}

function NavbarLink(props: { to: '/' | '/users'; label: string }) {
  const location = useLocation()
  const active = props.to !== '/' && location.pathname.startsWith(props.to)
  return (
    <Link
      {...sx(navbar.link, active ? navbar.linkActive : null, fx.focusable)}
      aria-current={active ? 'page' : undefined}
      to={props.to}
    >
      {props.label}
    </Link>
  )
}
