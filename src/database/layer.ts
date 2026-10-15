import { Effect, Layer } from 'effect'
import { ConfigService } from '../kernel/config/service.ts'
import type { DatabaseError } from '../kernel/errors.ts'
import { D1BindingNodeLayer, D1DatabaseLayer } from './d1.ts'
import type { DatabaseService } from './service.ts'
import { SqliteDatabaseLayer } from './sqlite.ts'

/**
 * Node database layer, chosen by `DATABASE_DRIVER`: `node:sqlite` (the default) or D1 through
 * wrangler's local proxy. The Workers entry provides its own D1 binding instead, which keeps
 * `node:sqlite` and `wrangler` out of the Worker bundle.
 */
export const DatabaseLayer: Layer.Layer<DatabaseService, DatabaseError, ConfigService> =
  Layer.unwrap(
    Effect.gen(function* () {
      const { database } = yield* ConfigService
      return database.driver === 'd1'
        ? D1DatabaseLayer.pipe(Layer.provide(D1BindingNodeLayer))
        : SqliteDatabaseLayer
    })
  )
