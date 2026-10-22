/**
 * The document shell (the index.html replacement), picked up by the
 * src/Document.* convention; it must render the full <html> and ships
 * no client JS. <HydrationScript /> is stripped from the prerendered
 * shell in client mode and activates under `ssr: true`.
 *
 * The Solid SSR shell bypasses Vite's transformIndexHtml, so the virtual
 * CSS link and hot-reload runtime must be rendered here (same pattern as
 * the StyleX RSC guide). In production both collapse to nothing: compiled
 * CSS ships in the bundled stylesheet and the runtime is a dev-only module.
 */

import { HydrationScript } from '@solidjs/web'
import type { ParentProps } from 'solid-js'
import { Show } from 'solid-js'
import { styles as rootLayout } from '#/resources/styles/element/root-layout.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import '#/assets/globals.css'

export default function Document(props: ParentProps) {
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.ico' />
        <title>Edgy</title>
        <Show when={import.meta.env.DEV}>
          <link href='/virtual:stylex.css' rel='stylesheet' />
          <script src='/@id/virtual:stylex:runtime' type='module' />
        </Show>
        <HydrationScript />
      </head>
      <body {...sx(rootLayout.root)}>{props.children}</body>
    </html>
  )
}
