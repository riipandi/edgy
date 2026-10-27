import { ErrorComponentProps, Link } from '@tanstack/react-router'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as errorStyles } from '#/resources/styles/pages/error.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

// The surface stays generic on purpose: the real cause was logged server-side
// before the boundary renders, and the message must never leak it.
export function ErrorBoundary({ reset }: ErrorComponentProps) {
  return (
    <main {...sx(fx.main)}>
      <h1 {...sx(fx.h1)}>Something went wrong</h1>
      <p {...sx(errorStyles.message, fx.muted)}>
        An unexpected error occurred while rendering this page.
      </p>
      <div {...sx(errorStyles.actions)}>
        <button
          {...sx(errorStyles.button, fx.link, fx.focusable)}
          onClick={() => reset()}
          type='button'
        >
          Try again
        </button>
        <Link {...sx(fx.link, fx.focusable)} to='/'>
          Back to home
        </Link>
      </div>
    </main>
  )
}
