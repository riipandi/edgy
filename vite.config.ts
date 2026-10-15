import { defineConfig } from 'vite'
import { edgy } from './builder/edgy.ts'

/**
 * Everything is in `builder/edgy.ts`: pages, styles, the dev server,
 * the build and the preview, for the Node server and, with `--mode worker`,
 * for Cloudflare Workers.
 *
 *   pnpm dev        pnpm dev --mode worker
 *   pnpm build      pnpm build --mode worker
 *   pnpm preview    pnpm preview --mode worker
 */
export default defineConfig((env) => ({ plugins: [edgy(env)] }))
