import { Effect, Layer, ManagedRuntime } from 'effect'
import { toNodeHandler } from 'h3/node'
import { makeNodeApp } from './application.ts'
import { migrateToLatest } from './database/migrator.ts'
import { ConfigService } from './kernel/config/service.ts'
import { CoreLayer } from './kernel/layers.ts'
import { AppLayer } from './layers.ts'

/**
 * Whether `pnpm dev` applies pending migrations. An unset `DATABASE_AUTO_MIGRATE` means yes, so a
 * fresh checkout needs only `pnpm dev`. `false` opts out.
 */
export const migratesInDev = (
  autoMigrate: boolean,
  env: Readonly<Record<string, string | undefined>>
): boolean => autoMigrate || env['DATABASE_AUTO_MIGRATE'] === undefined

/** A running development application: the request handler Vite mounts, and how to stop it. */
export interface DevApp {
  readonly handler: ReturnType<typeof toNodeHandler>
  /** Refuses new health checks, waits briefly for in-flight requests, then releases everything. */
  readonly stop: () => Promise<void>
}

/**
 * Builds the application for `pnpm dev`, inside the Vite dev server's process. It is the development
 * counterpart of `serve`, with the same layers and `makeNodeApp`, so requests are handled as in
 * production. Vite listens and serves the browser assets and the hot-reload channel, so there is no
 * assets route and no PROXY protocol reader here. The dev plugin calls this again after `stop`
 * whenever server code changes.
 *
 * Pending migrations run at every start unless `DATABASE_AUTO_MIGRATE=false`. There is no
 * `--auto-migrate` flag, since there is no command line.
 *
 * Loaded through Vite's module runner, which is what lets it import `.marko` pages. The production
 * entry never loads it.
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
