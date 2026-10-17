import { HydrationScript } from '@solidjs/web'
import { For } from 'solid-js'
import type { ParentProps } from 'solid-js'
import { navLink } from '../styles/components/link.css.ts'
import { body, brand, header, main, nav } from '../styles/elements/app-shell.css.ts'
import '../assets/global.css'

/**
 * The document every page composes: it owns `<html>`, the head, and hydration support.
 * `scripts` carries the page's built browser entries resolved by the handler from the build
 * manifest — the first item is the module script, the rest are its stylesheets.
 */
export const AppShell = (props: ParentProps<{ title: string; scripts?: readonly string[] }>) => (
  <html lang='en'>
    <head>
      <meta charset='utf-8' />
      <meta name='viewport' content='width=device-width, initial-scale=1' />
      <title>{props.title}</title>
      <HydrationScript />
      {props.scripts?.[0] !== undefined && <script type='module' src={props.scripts[0]} />}
      <For each={props.scripts?.slice(1)}>{(href) => <link rel='stylesheet' href={href} />}</For>
    </head>
    <body class={body}>
      <header class={header}>
        <a href='/' class={brand}>
          edgy
        </a>
        <nav class={nav} aria-label='Main'>
          <a href='/users' class={navLink}>
            Users
          </a>
        </nav>
      </header>
      <main class={main}>{props.children}</main>
    </body>
  </html>
)
