import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { Database, type DatabaseError } from '#/database/adapter.ts'
import type { AppConfig } from '#/kernel/config/config.ts'
import { apiRoutes } from '#/kernel/http/api.ts'
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
  const routes =
    middleware.length === 0
      ? apiRoutes
      : Layer.mergeAll(apiRoutes, ...middleware.map((m) => m as Layer.Layer<any>))
  const { handler, dispose } = HttpRouter.toWebHandler(
    routes.pipe(
      HttpRouter.provideRequest(services),
      Layer.provide(RateLimitCounterLayer),
      Layer.provide(databaseLayer),
      Layer.provide(appConfig),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )
  return { handler, dispose }
}
