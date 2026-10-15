#!/usr/bin/env node
import path from 'node:path'
import { supervise } from './supervisor.ts'

/**
 * `pnpm dev`: starts the development server (`dev_app.ts`) and starts it again whenever server
 * code under `src/` changes. Pages and styles are not watched here: Vite updates those in the
 * browser without a restart. The command line is passed on, so `pnpm dev` ends in `serve` and
 * `node builder/dev.ts serve --help` also works.
 *
 * Environment variables come from `--env-file` on this process (`watch:node`) and reach every
 * restart; editing `.env.local` needs `pnpm dev` to be started again.
 */
const root = path.resolve(import.meta.dirname, '..')

const supervisor = supervise({
  entry: path.join(import.meta.dirname, 'dev_app.ts'),
  args: process.argv.slice(2),
  watchDir: path.join(root, 'src'),
  // Tests are not part of the running server.
  ignore: (file) => file.endsWith('.test.ts'),
  log: (message) => process.stderr.write(`[dev] ${message}\n`),
  onExit: (code) => process.exit(code)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => supervisor.stop(signal))
}
