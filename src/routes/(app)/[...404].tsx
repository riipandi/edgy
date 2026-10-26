import { Title } from '@solidjs/meta'
import type { RouteDefinition } from '@solidjs/router'
import { httpStatus } from '@solidjs/web'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as notFound } from '#/resources/styles/pages/not-found.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// The catch-all route. httpStatus() is a no-op in the browser and takes
// effect when SSR is enabled; it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => httpStatus(404)
} satisfies RouteDefinition

export default function NotFound() {
  return (
    <main {...sx(fx.main)}>
      <Title>Not Found - Edgy</Title>
      <span {...sx(notFound.code)}>404</span>
      <h1 {...sx(fx.h2)}>Page Not Found</h1>
      <p {...sx(notFound.message)}>
        Visit{' '}
        <a
          {...sx(fx.link, fx.focusable)}
          href='https://docs.solidjs.com'
          target='_blank'
          rel='noreferrer'
        >
          docs.solidjs.com
        </a>{' '}
        to learn how to build Solid apps.
      </p>
    </main>
  )
}
