import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { GlobalContext } from '#/provider.tsx'
import { darkColors } from '#/resources/styles/core/themes.ts'
import { styles as rootLayout } from '#/resources/styles/element/root-layout.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import { ErrorBoundary } from './-boundaries.tsx'
import DevTools from './-devtools.tsx'
import '../assets/globals.css'

export const Route = createRootRouteWithContext<GlobalContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Edgy' }
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }]
  }),
  errorComponent: ErrorBoundary,
  shellComponent: RootDocument
})

function RootDocument({ children }: { children: ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang='en'>
      <head>
        {import.meta.env.DEV ? (
          <>
            <link href='/virtual:stylex.css' rel='stylesheet' />
            <script src='/@id/virtual:stylex:runtime' type='module' />
          </>
        ) : null}
        <HeadContent />
      </head>
      <body {...sx(rootLayout.root)}>
        <div {...sx(rootLayout.root, darkColors)}>
          {children}
          {import.meta.env.DEV ? <DevTools queryClient={queryClient} /> : null}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
