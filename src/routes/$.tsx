import { createFileRoute } from '@tanstack/react-router'
import { setStatus } from '#/kernel/ssr_status.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as notFound } from '#/resources/styles/pages/not-found.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// The catch-all route. The loader answers 404 during SSR while the not-found
// body still renders inside the shell.
export const Route = createFileRoute('/$')({
  head: () => ({ meta: [{ title: 'Not Found - Edgy' }] }),
  loader: () => setStatus(404),
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
