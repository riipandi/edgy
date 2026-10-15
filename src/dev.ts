import { Effect, Layer, ManagedRuntime } from 'effect'
import { toNodeHandler } from 'h3/node'
import { makeNodeApp } from './application.ts'
import { migrateToLatest } from './database/migrator.ts'
import { ConfigService } from './kernel/config/service.ts'
import { CoreLayer } from './kernel/layers.ts'
import { AppLayer } from './layers.ts'

/**
 * Whether `pnpm dev` applies pending migrations: unless the operator said otherwise. A variable that
 * is not set at all means yes (the zero-step first run); `DATABASE_AUTO_MIGRATE=false`, in the
 * environment or in `.env.local`, opts out, and `true` is yes either way.
 */
export const migratesInDev = (
  autoMigrate: boolean,
  env: Readonly<Record<string, string | undefined>>
): boolean => autoMigrate || env['DATABASE_AUTO_MIGRATE'] === undefined

/** A running development application: the request handler Vite mounts, and how to stop it. */
export interface DevApp {
  readonly handler: ReturnType<typeof toNodeHandler>
  /** Refuses new health checks, waits briefly for requests in flight, then releases everything. */
  readonly stop: () => Promise<void>
}

/**
 * Builds the application for `pnpm dev`, inside the Vite dev server's process.
 *
 * It is the development counterpart of the `serve` command: the same layers (`CoreLayer`,
 * `AppLayer`) and the same `makeNodeApp`, so a request is handled exactly as in production. What
 * differs is who listens (Vite, which also serves the browser assets and the hot-reload channel,
 * so there is neither an assets route nor a PROXY protocol reader here) and when it starts over:
 * the plugin in `builder/dev.ts` calls this again, after `stop`, whenever server code
 * changes.
 *
 * Pending migrations are applied at every start, so a fresh checkout needs nothing but `pnpm dev`;
 * `DATABASE_AUTO_MIGRATE=false` turns that off. (There is no `serve --auto-migrate` flag here:
 * there is no command line to give it.)
 *
 * This module is loaded through Vite's module runner (that is how it can import `.marko` pages),
 * never by the production entry.
 */
export const startDevApp = async (): Promise<DevApp> => {
  const runtime = ManagedRuntime.make(AppLayer.pipe(Layer.provideMerge(CoreLayer)))
  try {
    const { app, runtime: http } = await runtime.runPromise(
      Effect.gen(function* () {
        const { database } = yield* ConfigService
        if (migratesInDev(database.autoMigrate, process.env)) yield* migrateToLatest
        return yield* makeNodeApp({ development: true })
      })
    )
    return {
      handler: toNodeHandler(app),
      stop: async () => {
        http.beginDrain()
        await Effect.runPromise(http.inFlight.drained.pipe(Effect.timeoutOption('2 seconds')))
        await runtime.dispose()
      }
    }
  } catch (cause) {
    await runtime.dispose().catch(() => undefined)
    throw cause
  }
}
