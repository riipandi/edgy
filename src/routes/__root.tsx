import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import '../assets/globals.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Edgy' }
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }]
  }),
  component: RootComponent
})

function RootComponent() {
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
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
