import path from 'node:path'
import { createServerModuleRunner, loadEnv, type Plugin } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import { withDefaults } from './platform.ts'

/** The module `startDevApp` lives in, as Vite's module runner names it. */
const DEV_MODULE = '/src/dev.ts'

/** What `src/dev.ts` exports, checked rather than assumed: the runner returns `unknown` module shapes. */
interface DevModule {
  readonly startDevApp: () => Promise<{
    readonly handler: (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse
    ) => unknown
    readonly stop: () => Promise<void>
  }>
}

const isDevModule = (value: unknown): value is DevModule =>
  typeof value === 'object' &&
  value !== null &&
  'startDevApp' in value &&
  typeof value.startDevApp === 'function'

/** Files whose change starts the application over: server code (tests excluded) and the env files. */
const startsOver = (root: string, file: string): boolean => {
  const relative = path.relative(root, file)
  if (relative.startsWith('..')) return false
  if (/^\.env(\..+)?$/.test(relative)) return true
  return relative.startsWith(`src${path.sep}`) && !relative.endsWith('.test.ts')
}

/**
 * `pnpm dev`: runs the application inside the Vite dev server, on the one port.
 *
 * Vite serves what it serves (modules, the pages' scripts and styles, the hot-reload socket) and
 * everything it does not handle falls through to the application's own routes (the `post`
 * middleware hook runs after Vite's), so there is a single server, a single port and no proxy.
 * The application is loaded through Vite's SSR module runner, which is what lets it import `.marko`
 * pages and `.css.ts` styles.
 *
 * - **Environment.** `.env`, `.env.local` and the files of the mode (Vite's rules) are read here and put in `process.env` where it is not
 *   already set (what `node --env-file` did); `HOST` and `PORT` also decide where Vite listens, so
 *   they mean the same in `pnpm dev` as for the Node server. Loopback is the default host: a
 *   development server should not be reachable from the network unless asked.
 * - **Server code changes** (`src/`, tests excluded, and the env files) stop the application
 *   (`stop`: drain, then release the database and flush logs) and start a new one in the same
 *   process, then tell the browser to reload. Vite and its connection survive; page and style
 *   edits never get here, Vite updates those itself.
 * - **A failed start** (an invalid variable, a broken module) is kept and shown for every request
 *   until the next change, instead of retrying a start that cannot work.
 */
export const devServerPlugin = (): Plugin => {
  let runner: ModuleRunner | undefined
  let root = process.cwd()
  let running: Promise<Awaited<ReturnType<DevModule['startDevApp']>>> | undefined
  /** Variables this plugin put in `process.env`, so an edited env file can replace them. */
  const fromFile = new Set<string>()

  const applyEnv = (mode: string): Record<string, string> => {
    const env = loadEnv(mode, root, '')
    for (const key of fromFile) delete process.env[key]
    fromFile.clear()
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] !== undefined) continue
      process.env[key] = value
      fromFile.add(key)
    }
    return env
  }

  const start = async () => {
    if (runner === undefined) throw new Error('the dev server is not ready')
    // Evaluated modules are cached: without this a restart would run the old code again.
    runner.clearCache()
    const module: unknown = await runner.import(DEV_MODULE)
    if (!isDevModule(module)) throw new Error(`${DEV_MODULE} must export startDevApp()`)
    return module.startDevApp()
  }

  const current = () => (running ??= start())

  const stop = async () => {
    const previous = running
    running = undefined
    await previous?.then((app) => app.stop()).catch(() => undefined)
  }

  return {
    name: 'edgy:dev-server',
    apply: 'serve',

    config(config, env) {
      root = path.resolve(config.root ?? process.cwd())
      const loaded = applyEnv(env.mode)
      // The preview (`pnpm preview`) listens where the dev server does.
      const address = {
        host: process.env['HOST'] ?? loaded['HOST'] ?? '127.0.0.1',
        port: Number(process.env['PORT'] ?? loaded['PORT'] ?? 3000),
        // A busy port is an error, not a silent move to another one (the docs name one address).
        strictPort: true
      }
      withDefaults(config, { server: address, preview: address })
    },

    configureServer(devServer) {
      runner = createServerModuleRunner(devServer.environments.ssr)
      const logger = devServer.config.logger

      devServer.watcher.on('all', (_event, file) => {
        if (!startsOver(root, file)) return
        logger.info(`${path.relative(root, file)} changed, restarting the application`, {
          timestamp: true
        })
        void (async () => {
          await stop()
          applyEnv(devServer.config.mode)
          current().then(
            () => devServer.hot.send({ type: 'full-reload' }),
            (error: unknown) =>
              logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
          )
        })()
      })

      devServer.httpServer?.once('close', () => void stop().then(() => runner?.close()))

      // Returned, so it runs after Vite's own middleware: whatever Vite does not answer is ours.
      return () => {
        devServer.middlewares.use((req, res, next) => {
          current().then(
            (app) => app.handler(req, res),
            (error: unknown) => next(error instanceof Error ? error : new Error(String(error)))
          )
        })
      }
    },

    async closeBundle() {
      await stop()
    }
  }
}
