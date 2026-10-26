import { Title } from '@solidjs/meta'
import { Loading } from 'solid-js'
import { darkColors } from '#/resources/styles/core/themes.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as rootLayout } from '#/resources/styles/element/root-layout.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import { Router } from '#/router.ts'

// Router and providers only; the `routes/(app)` layout
// owns the shell, theme, and loading boundary.
export default function App() {
  return (
    <div {...sx(rootLayout.root, darkColors)}>
      <Title>Edgy</Title>
      <Router>
        {(props) => (
          <Loading fallback={<main {...sx(fx.container)}>Loading…</main>}>{props.children}</Loading>
        )}
      </Router>
    </div>
  )
}
