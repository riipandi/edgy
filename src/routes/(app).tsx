import type { ParentProps } from 'solid-js'
import Navbar from '#/resources/components/navbar'

// Group layout for every page inside (app)/: the app shell (nav)
// stays mounted while pages change underneath it, and `(app)` never
// shows up in the URL.
export default function RouteComponent(props: ParentProps) {
  return (
    <>
      <Navbar />
      {props.children}
    </>
  )
}
