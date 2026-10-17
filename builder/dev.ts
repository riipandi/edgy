import path from 'node:path'
import { createServerModuleRunner, loadEnv, type Plugin } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'

/** Module id, as the module runner names it, of the file that exports `startDevApp`. */
const DEV_MODULE = '/src/dev.ts'

/** The runner types modules as `unknown`, so the export is checked at runtime. */
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

/** Changes that restart the application: server code (tests excluded) and env files. */
const startsOver = (root: string, file: string): boolean => {
  const relative = path.relative(root, file)
  if (relative.startsWith('..')) return false
  // `.env.example` is generated documentation, not configuration.
  if (/^\.env(\..+)?$/.test(relative)) return relative !== '.env.example'
  return relative.startsWith(`src${path.sep}`) && !relative.endsWith('.test.ts')
}

/**
 * `pnpm dev`: runs the application inside the Vite dev server, on one port.
 *
 * Vite handles what it can (modules, page scripts and styles, the hot-reload socket). Anything else
 * falls through to the application's routes. The application loads through Vite's SSR module
 * runner, so it can import page templates and `.css.ts` styles.
 *
 * - **Environment.** Env files fill `process.env` only for variables not already set, as
 *   `node --env-file` does.
 * - **Server code changes** (`src/`, tests excluded, and env files) stop the application, start a
 *   new one in the same process, and reload the browser. Page and style edits never reach this
 *   plugin; Vite updates those itself.
 * - **A failed start** is shown for every request until the next change; retrying would only repeat
 *   the error.
 */
export const devServerPlugin = (): Plugin => {
  let runner: ModuleRunner | undefined
  let restarting: Promise<void> = Promise.resolve()
  let root = process.cwd()
  let running: Promise<Awaited<ReturnType<DevModule['startDevApp']>>> | undefined
  /** Variables set from env files here, so an edited file can replace them. */
  const fromFile = new Set<string>()

  const applyEnv = (mode: string): void => {
    const env = loadEnv(mode, root, '')
    for (const key of fromFile) delete process.env[key]
    fromFile.clear()
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] !== undefined) continue
      process.env[key] = value
      fromFile.add(key)
    }
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
      applyEnv(env.mode)
    },

    configureServer(devServer) {
      runner = createServerModuleRunner(devServer.environments.ssr)
      const logger = devServer.config.logger

      devServer.watcher.on('all', (_event, file) => {
        if (!startsOver(root, file)) return
        logger.info(`${path.relative(root, file)} changed, restarting the application`, {
          timestamp: true
        })
        // Chained, so a second save during a restart waits instead of starting another app.
        restarting = restarting.then(async () => {
          await stop()
          applyEnv(devServer.config.mode)
          await current().then(
            () => devServer.hot.send({ type: 'full-reload' }),
            (error: unknown) =>
              logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
          )
        })
      })

      devServer.httpServer?.once('close', () => void stop().then(() => runner?.close()))

      // Returned, so it runs after Vite's middleware and receives only what Vite does not answer.
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
