import { ConfigProvider, Duration, Effect, Layer, ManagedRuntime } from 'effect'
import { OtlpExporter } from 'effect/observability'
import type { H3 } from 'h3'
import { createApp } from './app.ts'
import { D1Binding, D1DatabaseLayer, isD1Database } from './database/d1.ts'
import { migrateToLatest } from './database/migrator.ts'
import { ConfigLayer, ConfigService } from './kernel/config/service.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'
import { ErrorReporterLayer } from './observer/error_reporter.ts'
import { ConsoleLoggerLayer } from './observer/logger.ts'
import { TelemetryRuntimeLayer } from './observer/telemetry.ts'
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
interface WorkerApp {
  readonly app: H3
  /** Sends what the exporters have buffered. Bounded, and it cannot fail. */
  readonly flush: () => Promise<void>
  /** How often `flush` is worth calling (`OTEL_EXPORT_INTERVAL`), in milliseconds. */
  readonly flushEvery: number
}

const buildApp = async (env: WorkerEnv): Promise<WorkerApp> => {
  const strings = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )

  const core = Layer.mergeAll(
    TelemetryRuntimeLayer,
    ErrorReporterLayer,
    ConsoleLoggerLayer.pipe(Layer.provide(TelemetryRuntimeLayer))
  ).pipe(
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
      const { flush } = yield* OtlpExporter.Flusher
      return {
        app: createApp({ runtime: http, config }),
        flush: () =>
          runtime.runPromise(flush.pipe(Effect.timeoutOption('2 seconds'), Effect.asVoid)),
        flushEvery: Duration.toMillis(config.observability.exportInterval)
      }
    })
  )
}

const apps = new WeakMap<object, Promise<WorkerApp>>()

/** The app for this environment, built on first use and shared by later requests. */
const appFor = (env: WorkerEnv): Promise<WorkerApp> => {
  let app = apps.get(env)
  if (app === undefined) {
    app = buildApp(env)
    apps.set(env, app)
    // A failed build must not poison the isolate: retry on the next request.
    app.catch(() => apps.delete(env))
  }
  return app
}

/** The part of Cloudflare's `ExecutionContext` this entry uses. */
interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

/** When this isolate last handed its buffers to the exporters. */
let lastFlush = 0

/**
 * Cloudflare Workers entry (`wrangler.jsonc` → `main`). Run it locally with
 * `pnpm watch:worker` (source) or `pnpm preview` (built bundle); deploy with `pnpm deploy`.
 *
 * A Worker has no shutdown hook, so buffered telemetry would be lost whenever the isolate
 * is evicted. After the response, `waitUntil` keeps the isolate alive long enough to flush
 * it, at most once per `OTEL_EXPORT_INTERVAL`: a flush per request would turn every request
 * into three extra subrequests. With no endpoint configured the flush is a no-op.
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const { app, flush, flushEvery } = await appFor(env)
    const response = await app.fetch(request)

    const now = Date.now()
    if (now - lastFlush >= flushEvery) {
      lastFlush = now
      ctx.waitUntil(flush())
    }
    return response
  }
}
