import { ConfigProvider, Duration, Effect, Layer, ManagedRuntime } from 'effect'
import { OtlpExporter } from 'effect/observability'
import { Persistence } from 'effect/persistence'
import type { H3 } from 'h3'
import { createApp } from './app.ts'
import { D1Binding, D1DatabaseLayer, isD1Database } from './database/d1.ts'
import { migrateToLatest } from './database/migrator.ts'
import { defaultEdgeCache, layerBackingEdgeCache } from './kernel/cache/edge_cache.ts'
import { guardBacking } from './kernel/cache/guard.ts'
import { LocalCachePersistence } from './kernel/cache/local.ts'
import { ConfigLayer, ConfigService } from './kernel/config/service.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'
import type { RateCheck } from './middleware/rate_limit.ts'
import { isRateLimitBinding, makeBindingRateCheck } from './middleware/rate_limit_binding.ts'
import { ErrorReporterLayer } from './observer/error_reporter.ts'
import { ConsoleLoggerLayer } from './observer/logger.ts'
import { TelemetryRuntimeLayer } from './observer/telemetry.ts'
import { ServicesLayer } from './services.ts'

/** What Cloudflare passes to `fetch`: vars and secrets as strings, bindings as objects. */
type WorkerEnv = Readonly<Record<string, unknown>>

/** A built Worker application: the handler, the telemetry flush, and how often a flush is worthwhile. */
interface WorkerApp {
  readonly app: H3
  /** Sends what the exporters have buffered. Bounded, and it cannot fail. */
  readonly flush: () => Promise<void>
  /** How often `flush` is worth calling (`OTEL_EXPORT_INTERVAL`), in milliseconds. */
  readonly flushEvery: number
}

/**
 * Builds the application for one Worker environment: config from the Worker's vars (not
 * `process.env`), the D1 binding it names, the services on top, and the same `createApp` the Node
 * server uses. There is no `CoreLayer`, which carries Node platform services and a stdout logger.
 * Listing the pieces explicitly keeps `node:sqlite`, `wrangler` and the CLI out of the bundle.
 */
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

  const cachePersistence = Layer.unwrap(
    Effect.gen(function* () {
      const { cache } = yield* ConfigService
      if (!cache.enabled || cache.store === 'memory') return LocalCachePersistence
      if (cache.store === 'redis') {
        return yield* Effect.die(
          new Error('CACHE_STORE=redis is not available on Workers (use memory or cloudflare)')
        )
      }
      const edge = defaultEdgeCache()
      if (edge === undefined) {
        return yield* Effect.die(new Error('CACHE_STORE=cloudflare needs the Workers Cache API'))
      }
      return Persistence.layer.pipe(Layer.provide(guardBacking(layerBackingEdgeCache(edge))))
    })
  )

  const layer = ServicesLayer.pipe(
    Layer.provide(cachePersistence),
    Layer.provideMerge(D1DatabaseLayer),
    Layer.provide(binding),
    Layer.provideMerge(core)
  )

  // One runtime per isolate, never disposed once built: the isolate is the lifetime.
  const runtime = ManagedRuntime.make(layer)

  return runtime
    .runPromise(
      Effect.gen(function* () {
        const config = yield* ConfigService
        if (config.database.autoMigrate) yield* migrateToLatest
        const http = yield* makeHttpRuntime
        const { flush } = yield* OtlpExporter.Flusher
        const { security } = config

        // Fail the build of the isolate, not each request, when the store cannot work here.
        if (security.rateLimitEnabled && security.rateLimitStore === 'redis') {
          return yield* Effect.die(
            new Error(
              'RATE_LIMIT_STORE=redis is not available on Workers (use memory or cloudflare)'
            )
          )
        }
        let rateCheck: RateCheck | undefined
        if (security.rateLimitEnabled && security.rateLimitStore === 'cloudflare') {
          const limiter = env[security.rateLimitBinding]
          if (!isRateLimitBinding(limiter)) {
            return yield* Effect.die(
              new Error(
                `No rate limit binding named "${security.rateLimitBinding}" (check "ratelimits" in wrangler.jsonc / RATE_LIMIT_BINDING)`
              )
            )
          }
          rateCheck = makeBindingRateCheck({
            binding: limiter,
            limit: security.rateLimitMax,
            windowMs: Duration.toMillis(security.rateLimitWindow),
            warn: (message, cause) => http.runSync(Effect.logWarning(message, cause))
          })
        }

        return {
          app: createApp({
            runtime: http,
            config,
            // Under `pnpm dev --mode worker`, Vite injects styles and opens a hot-reload socket, which
            // the HTML policy must allow. A build replaces this with `false`.
            development: import.meta.env.DEV,
            ...(rateCheck === undefined ? {} : { rateCheck })
          }),
          flush: () =>
            runtime.runPromise(flush.pipe(Effect.timeoutOption('2 seconds'), Effect.asVoid)),
          flushEvery: Duration.toMillis(config.observability.exportInterval)
        }
      })
    )
    .catch(async (cause: unknown) => {
      // A failed build is retried on the next request, so dispose its runtime here. Otherwise each
      // attempt leaks a runtime and its exporter fiber.
      await runtime.dispose().catch(() => undefined)
      throw cause
    })
}

const apps = new WeakMap<object, Promise<WorkerApp>>()

/** The app for this environment, built on first use and shared by later requests. */
const appFor = (env: WorkerEnv): Promise<WorkerApp> => {
  let app = apps.get(env)
  if (app === undefined) {
    // A ConfigError is not an Error. Unwrapped, the runtime logs "[object Object]" and the reason is lost.
    app = buildApp(env).catch((cause: unknown) => {
      throw cause instanceof Error ? cause : new Error(String(cause))
    })
    apps.set(env, app)
    // A failed build is removed, so the next request retries it.
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
 * Cloudflare Workers entry. Run locally with `pnpm dev --mode worker` (source) or
 * `pnpm preview --mode worker` (built bundle).
 *
 * A Worker has no shutdown hook, so buffered telemetry is lost when the isolate is evicted.
 * `waitUntil` keeps the isolate alive after the response to flush, at most once per
 * `OTEL_EXPORT_INTERVAL`, since a flush per request would add subrequests to every request.
 * With no endpoint configured the flush is a no-op.
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
