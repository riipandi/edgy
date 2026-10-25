import { Layer, Logger } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { Database, type DatabaseError } from '#/database/adapter.ts'
import type { AppConfig } from '#/kernel/config/config.ts'
import { apiRoutes } from '#/kernel/http/api.ts'
import { errorResponseMiddleware } from '#/middleware/error-response.ts'
import { RateLimitCounterLayer } from '#/middleware/rate-limit.ts'
import { migratedDatabase } from './database.ts'

/** Builds a web handler over the composed API routes with the given services and config. */
export const toHandler = (
  services: Layer.Layer<any>,
  appConfig: Layer.Layer<AppConfig>,
  databaseLayer: Layer.Layer<Database, DatabaseError, never> = migratedDatabase,
  middleware: ReadonlyArray<Layer.Layer<any>> = []
) => {
  // A middleware layer mutates the router service, so each one folds over the
  // composed routes; the cast keeps the resolved web handler single-argument.
  // The error-body middleware rides the same merge as the serve composition,
  // so every /api failure answers JSON here too.
  const routes = Layer.mergeAll(apiRoutes, errorResponseMiddleware, ...middleware)
  const { handler, dispose } = HttpRouter.toWebHandler(
    Layer.mergeAll(
      routes.pipe(
        HttpRouter.provideRequest(services),
        Layer.provide(RateLimitCounterLayer),
        Layer.provide(databaseLayer),
        Layer.provide(appConfig),
        Layer.provide(HttpServer.layerServices)
      ),
      // Keep test output quiet: app logs are asserted through a capturing
      // logger where a test needs them, never through the console.
      Logger.layer([Logger.make(() => void 0)])
    ),
    { disableLogger: true }
  )
  return { handler, dispose }
}
