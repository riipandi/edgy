import { Outlet, createFileRoute } from '@tanstack/react-router'
import Navbar from '#/resources/components/navbar.tsx'

// Pathless layout for every page inside _app/: the app shell (nav)
// stays mounted while pages change underneath it, and _app never
// shows up in the URL.
export const Route = createFileRoute('/_app')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  )
}
