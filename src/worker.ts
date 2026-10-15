import { ConfigProvider, Effect, Layer, ManagedRuntime } from 'effect'
import type { H3 } from 'h3'
import { createApp } from './app.ts'
import { D1Binding, D1DatabaseLayer, isD1Database } from './database/d1.ts'
import { migrateToLatest } from './database/migrator.ts'
import { ConfigLayer, ConfigService } from './kernel/config/service.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'
import { ConsoleLoggerLayer } from './observer/logger.ts'
import { ServicesLayer } from './services.ts'

/** What Cloudflare passes to `fetch`: vars and secrets as strings, bindings as objects. */
type WorkerEnv = Readonly<Record<string, unknown>>

/**
 * Builds the application for one Worker environment: configuration from the
 * Worker's own vars (not `process.env`), the D1 binding it names, the services on
 * top, and the same `createApp` the Node server uses.
 *
 * There is no `CoreLayer` here: it carries Node platform services and a stdout
 * logger. The pieces a Worker needs are listed explicitly instead, which is also
 * what keeps `node:sqlite`, `wrangler` and the CLI out of the Worker bundle.
 */
const buildApp = async (env: WorkerEnv): Promise<H3> => {
  const strings = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )

  const core = Layer.mergeAll(ConsoleLoggerLayer).pipe(
    Layer.provideMerge(ConfigLayer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(strings)))
  )

  const binding = Layer.effect(
    D1Binding,
    Effect.gen(function* () {
      const { database } = yield* ConfigService
      const candidate = env[database.d1Binding]
      if (!isD1Database(candidate)) {
        return yield* Effect.die(
          new Error(
            `No D1 binding named "${database.d1Binding}" (check wrangler.jsonc / D1_BINDING)`
          )
        )
      }
      return candidate
    })
  )

  const layer = ServicesLayer.pipe(
    Layer.provideMerge(D1DatabaseLayer),
    Layer.provide(binding),
    Layer.provideMerge(core)
  )

  // One runtime per isolate, never disposed: the isolate is the lifetime.
  const runtime = ManagedRuntime.make(layer)

  return runtime.runPromise(
    Effect.gen(function* () {
      const config = yield* ConfigService
      if (config.database.autoMigrate) yield* migrateToLatest
      const http = yield* makeHttpRuntime
      return createApp({ runtime: http, config })
    })
  )
}

const apps = new WeakMap<object, Promise<H3>>()

/** The app for this environment, built on first use and shared by later requests. */
const appFor = (env: WorkerEnv): Promise<H3> => {
  let app = apps.get(env)
  if (app === undefined) {
    app = buildApp(env)
    apps.set(env, app)
    // A failed build must not poison the isolate: retry on the next request.
    app.catch(() => apps.delete(env))
  }
  return app
}

/**
 * Cloudflare Workers entry (`wrangler.jsonc` → `main`). Run it locally with
 * `pnpm preview`; deploy with `pnpm deploy`.
 */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const app = await appFor(env)
    return app.fetch(request)
  }
}
