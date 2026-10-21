import { Title } from '@solidjs/meta'
import { For } from 'solid-js'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as home } from '#/resources/styles/pages/home.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import { paths } from '#/router.ts'

const features: ReadonlyArray<readonly [string, string]> = [
  ['File-Based Routing', 'Routes and layouts are derived from the src/routes directory.'],
  ['Effect API Server', 'Type-safe HTTP handlers and services powered by Effect.'],
  ['Solid 2 Reactivity', 'Fine-grained signals, memos, and actions without a virtual DOM.'],
  ['StyleX Styling', 'Type-safe, compile-time atomic styling with themed design tokens.']
]

export default function RouteComponent() {
  return (
    <main {...sx(fx.container)}>
      <Title>Home - Solid App</Title>

      <section {...sx(home.hero)}>
        <div {...sx(home.glow, home.glowPrimary)} />
        <div {...sx(home.glow, home.glowPrimaryFaded)} />
        <p {...sx(fx.eyebrow)}>Solid Start Base Template</p>
        <h1 {...sx(fx.display)}>Start simple, ship quickly.</h1>
        <p {...sx(home.description)}>
          This base starter intentionally keeps things light: file-based routes, a typed API server,
          and the essentials you need to build from scratch.
        </p>
        <div {...sx(home.ctaRow)}>
          <a {...sx(home.buttonPrimary, fx.focusable)} href={paths.users()}>
            Users
          </a>
          <a
            href='https://v2.solidjs.com/'
            {...sx(home.buttonNeutral, fx.focusable)}
            rel='noopener noreferrer'
            target='_blank'
          >
            Docs
          </a>
        </div>
      </section>

      <section {...sx(home.cardGrid)}>
        <For each={features}>
          {([title, description], index) => (
            <article {...sx(home.card)} style={{ 'animation-delay': `${index() * 90 + 80}ms` }}>
              <h2 {...sx(home.cardTitle)}>{title}</h2>
              <p {...sx(home.cardDescription)}>{description}</p>
            </article>
          )}
        </For>
      </section>

      <section {...sx(home.quickStart)}>
        <p {...sx(home.quickStartTitle)}>Quick Start</p>
        <ul {...sx(home.quickStartList)}>
          <li>
            Edit <code {...sx(home.code)}>src/routes/index.tsx</code> to customize the home page.
          </li>
          <li>
            Add routes in <code {...sx(home.code)}>src/routes</code> and tweak visual tokens in{' '}
            <code {...sx(home.code)}>src/resources/styles/core/colors.stylex.ts</code>.
          </li>
        </ul>
      </section>
    </main>
  )
}
