import { createFileRoute } from '@tanstack/react-router'
import { setResponseStatus } from '@tanstack/react-start/server'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as notFound } from '#/resources/styles/pages/not-found.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// The catch-all route. setResponseStatus is a no-op in the browser and takes
// effect when SSR is enabled; it runs in the loader so the status code is set
// before the response head flushes.
export const Route = createFileRoute('/$')({
  head: () => ({ meta: [{ title: 'Not Found - Edgy' }] }),
  loader: () => {
    if (import.meta.env.SSR) setResponseStatus(404)
  },
  component: NotFoundPage
})

function NotFoundPage() {
  return (
    <main {...sx(fx.main)}>
      <span {...sx(notFound.code)}>404</span>
      <h1 {...sx(fx.h2)}>Page Not Found</h1>
      <p {...sx(notFound.message)}>
        Visit{' '}
        <a
          {...sx(fx.link, fx.focusable)}
          href='https://tanstack.com/start/latest'
          target='_blank'
          rel='noreferrer'
        >
          tanstack.com/start
        </a>{' '}
        to learn how to build React apps.
      </p>
    </main>
  )
}
