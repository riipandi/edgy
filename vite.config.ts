/**
 * Plain Vite configuration. The `edgy` plugin supplies the application's setup for
 * the Node server and, with `--mode worker`, for Cloudflare Workers. It fills in
 * only what is not set here, so anything below or added here (`server.proxy`,
 * `build.sourcemap`, `resolve.alias`, `define`, more `plugins`) takes precedence
 * over the plugin's defaults.
 *
 *   pnpm dev        pnpm dev --mode worker
 *   pnpm build      pnpm build --mode worker
 *   pnpm preview    pnpm preview --mode worker
 */

import { defineConfig, loadEnv } from 'vite'
import { edgy } from './builder/edgy.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const address = {
    host: env['HOST'] ?? '127.0.0.1',
    port: Number(env['PORT'] ?? 3000),
    strictPort: true
  }
  return {
    plugins: [edgy({ mode })],
    resolve: { tsconfigPaths: true },
    build: {
      emptyOutDir: true,
      chunkSizeWarningLimit: 1024,
      reportCompressedSize: false
    },
    server: address,
    preview: address
  }
})
