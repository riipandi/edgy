/**
 * The document shell (the index.html replacement), picked up by the
 * src/Document.* convention; it must render the full <html> and ships
 * no client JS. <HydrationScript /> is stripped from the prerendered
 * shell in client mode and activates under `ssr: true`.
 */

import { HydrationScript } from '@solidjs/web'
import type { ParentProps } from 'solid-js'
import { styles as rootLayout } from './resources/styles/element/root-layout.stylex'
import DevStyleXInject from './resources/styles/inject'
import { sx } from './resources/styles/props'
import './assets/globals.css'

export default function Document(props: ParentProps) {
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.ico' />
        <title>Solid App</title>
        <DevStyleXInject />
        <HydrationScript />
      </head>
      <body {...sx(rootLayout.root)}>{props.children}</body>
    </html>
  )
}
