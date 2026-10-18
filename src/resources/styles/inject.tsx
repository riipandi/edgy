/**
 * Dev-only StyleX CSS injection. The Solid SSR shell bypasses Vite's
 * transformIndexHtml, so the virtual CSS link and hot-reload runtime must be
 * rendered here (same pattern as the StyleX RSC guide). In production both
 * collapse to nothing: compiled CSS ships in the bundled stylesheet and the
 * runtime is a dev-only module. The condition stays inside <Show> because
 * Solid components run once (an early return would break reactivity).
 */

import { Show } from 'solid-js'

export default function DevStyleXInject() {
  return (
    <Show when={import.meta.env.DEV}>
      <link href='/virtual:stylex.css' rel='stylesheet' />
      <script src='/@id/virtual:stylex:runtime' type='module' />
    </Show>
  )
}
