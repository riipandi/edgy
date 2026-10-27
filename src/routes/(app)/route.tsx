import { Outlet, createFileRoute } from '@tanstack/react-router'
import Navbar from '#/resources/components/navbar.tsx'

// Route group for every page that renders inside the app shell: the
// navigation stays mounted while pages change underneath it, and the
// group segment never shows up in the URL.
export const Route = createFileRoute('/(app)')({
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
