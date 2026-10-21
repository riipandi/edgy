import { Title } from '@solidjs/meta'
import type { ParentProps } from 'solid-js'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// A layout route: pairing users.tsx with the users/ directory nests
// every page inside it under this component.
export default function RouteComponent(props: ParentProps) {
  return (
    <main {...sx(fx.container)}>
      <Title>Users - Solid App</Title>
      <p {...sx(fx.eyebrow)}>Directory</p>
      <h1 {...sx(fx.display)}>Users</h1>
      {props.children}
    </main>
  )
}
