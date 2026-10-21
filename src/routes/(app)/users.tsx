import { Title } from '@solidjs/meta'
import type { ParentProps } from 'solid-js'
import { fx } from '#/resources/styles/core/utils.stylex'
import { styles as rootLayout } from '#/resources/styles/element/root-layout.stylex'
import { sx } from '#/resources/styles/props'

// A layout route: pairing users.tsx with the users/ directory nests
// every page inside it under this component.
export default function RouteComponent(props: ParentProps) {
  return (
    <main {...sx(fx.main, rootLayout.section)}>
      <Title>Users - Solid App</Title>
      <h1 {...sx(fx.h1)}>Users</h1>
      {props.children}
    </main>
  )
}
