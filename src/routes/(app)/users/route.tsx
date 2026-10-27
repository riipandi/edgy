import { Outlet, createFileRoute } from '@tanstack/react-router'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// A layout route: the users/ directory nests every page under this
// component so the directory heading and container are shared.
export const Route = createFileRoute('/(app)/users')({
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
