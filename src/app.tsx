import { Title } from '@solidjs/meta'
import { Loading } from 'solid-js'
import { darkColors } from '#/resources/styles/core/themes'
import { fx } from '#/resources/styles/core/utils.stylex'
import { styles as rootLayout } from '#/resources/styles/element/root-layout.stylex'
import { sx } from '#/resources/styles/props'
import { Router } from '#/router'

// Router and providers only: the theme wrapper (darkColors)
// and the Loading boundary live here; the app shell (nav)
// is the (app) group layout route.
export default function App() {
  return (
    <div {...sx(rootLayout.root, darkColors)}>
      <Router>
        {(props) => (
          <>
            <Title>Solid App</Title>
            <Loading fallback={<main {...sx(fx.main)}>Loading…</main>}>{props.children}</Loading>
          </>
        )}
      </Router>
    </div>
  )
}
