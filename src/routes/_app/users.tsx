import { Outlet, createFileRoute } from '@tanstack/react-router'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// A layout route: pairing users.tsx with the users/ directory nests
// every page inside it under this component.
export const Route = createFileRoute('/_app/users')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <main {...sx(fx.container)}>
      <p {...sx(fx.eyebrow)}>Directory</p>
      <h1 {...sx(fx.display)}>Users</h1>
      <Outlet />
    </main>
  )
}
