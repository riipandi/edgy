import { ConfigProvider, Effect, Layer, ManagedRuntime } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { Persistence } from 'effect/persistence'
import type { H3 } from 'h3'
import { createApp } from '../src/app.ts'
import { migrateToLatest } from '../src/database/migrator.ts'
import type { DatabaseService } from '../src/database/service.ts'
import { SqliteDatabaseLayer } from '../src/database/sqlite.ts'
import { LocalCachePersistence } from '../src/kernel/cache/local.ts'
import { ConfigLayer, ConfigService } from '../src/kernel/config/service.ts'
import { type HttpRuntime, makeHttpRuntime } from '../src/kernel/http/runtime.ts'
import type { RateCheck } from '../src/middleware/rate_limit.ts'
import type { UserRepository } from '../src/modules/user/user_repo.ts'
import type { UserService } from '../src/modules/user/user_service.ts'
import { ErrorReporterLayer } from '../src/observer/error_reporter.ts'
import { ConsoleLoggerLayer } from '../src/observer/logger.ts'
import { TelemetryRuntimeLayer } from '../src/observer/telemetry.ts'
import type { Platform } from '../src/routes/route.ts'
import { ServicesLayer } from '../src/services.ts'

/** Variables every test app starts from: a private in-memory database and no log output. */
const BASE_ENV: Readonly<Record<string, string>> = {
  DATABASE_PATH: ':memory:',
  LOG_LEVEL: 'None',
  // The defaults point at the Docker Compose collector; a test must not export to it.
  OTEL_SDK_DISABLED: 'true'
}

/** Services available to {@link TestApp.run}. */
export type TestServices = ConfigService | DatabaseService | UserRepository | UserService

export interface TestApp {
  readonly app: H3
  readonly http: HttpRuntime
  /** Sends a request to the in-process app, JSON-encoding `body` when given. */
  readonly request: (
    path: string,
    init?: {
      readonly method?: string
      readonly body?: unknown
      readonly headers?: Record<string, string>
    }
  ) => Promise<Response>
  /** Runs an Effect against the app's services (repositories, database, ...). */
  readonly run: <A, E>(effect: Effect.Effect<A, E, TestServices>) => Promise<A>
  readonly dispose: () => Promise<void>
}

/**
 * Builds the real application — same `createApp`, same services, same migrations
 * — over a private in-memory SQLite database, and talks to it through
 * `app.fetch`, so tests exercise the whole stack without opening a port.
 *
 * `env` overrides configuration the way real environment variables would, so a
 * test can turn on rate limiting or metrics exactly as an operator does.
 */
export const makeTestApp = async (
  env: Readonly<Record<string, string>> = {},
  options: {
    readonly fetch?: typeof globalThis.fetch
    readonly rateCheck?: RateCheck
    /** Where the app runs; `workers` makes `CF-Connecting-IP` the client address. */
    readonly platform?: Platform
    /** Stands in for the shared cache store (`CACHE_STORE=redis`); in-process when absent. */
    readonly cacheBacking?: Layer.Layer<Persistence.BackingPersistence>
  } = {}
): Promise<TestApp> => {
  const provider = ConfigProvider.fromEnvRecord({ ...BASE_ENV, ...env })

  // `options.fetch` stands in for the network, so a test can read what the exporters send.
  const telemetry =
    options.fetch === undefined
      ? TelemetryRuntimeLayer
      : TelemetryRuntimeLayer.pipe(
          Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(options.fetch))
        )

  const core = Layer.mergeAll(
    telemetry,
    ErrorReporterLayer,
    ConsoleLoggerLayer.pipe(Layer.provide(telemetry))
  ).pipe(Layer.provideMerge(ConfigLayer), Layer.provide(ConfigProvider.layer(provider)))
  const cachePersistence =
    options.cacheBacking === undefined
      ? LocalCachePersistence
      : Persistence.layer.pipe(Layer.provide(options.cacheBacking))
  const layer = ServicesLayer.pipe(
    Layer.provide(cachePersistence),
    Layer.provideMerge(SqliteDatabaseLayer),
    Layer.provideMerge(core)
  )
  const runtime = ManagedRuntime.make(layer)

  const built = await runtime.runPromise(
    Effect.gen(function* () {
      const config = yield* ConfigService
      yield* migrateToLatest
      const httpRuntime = yield* makeHttpRuntime
      return {
        app: createApp({
          runtime: httpRuntime,
          config,
          ...(options.platform === undefined ? {} : { platform: options.platform }),
          ...(options.rateCheck === undefined ? {} : { rateCheck: options.rateCheck })
        }),
        http: httpRuntime
      }
    })
  )

  const { app, http } = built
  return {
    app,
    http,
    request: async (path, init = {}) =>
      app.fetch(
        new Request(`http://test${path}`, {
          method: init.method ?? 'GET',
          headers: {
            ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...init.headers
          },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
        })
      ),
    run: (effect) => runtime.runPromise(effect),
    dispose: () => runtime.dispose()
  }
}
