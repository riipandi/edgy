import { Effect, Layer } from 'effect'
import { ConfigService } from '../kernel/config/service.ts'
import type { DatabaseError } from '../kernel/errors.ts'
import { D1DatabaseLayer } from './d1.ts'
import { d1BindingNodeLayer } from './d1_node.ts'
import type { DatabaseService } from './service.ts'
import { SqliteDatabaseLayer } from './sqlite.ts'

/**
 * Node database layer, chosen by `DATABASE_DRIVER`: `node:sqlite` (the default) or D1 through
 * wrangler's proxy. With `remote` the driver is D1 whatever `DATABASE_DRIVER` says, and the proxy
 * reaches the real database (`--remote` on the migrate commands). The Workers entry provides its
 * own D1 binding instead, which keeps `node:sqlite` and `wrangler` out of the Worker bundle.
 */
export const databaseLayer = (
  options: { readonly remote?: boolean } = {}
): Layer.Layer<DatabaseService, DatabaseError, ConfigService> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const { database } = yield* ConfigService
      return options.remote === true || database.driver === 'd1'
        ? D1DatabaseLayer.pipe(
            Layer.provide(d1BindingNodeLayer({ remote: options.remote === true }))
          )
        : SqliteDatabaseLayer
    })
  )

export const DatabaseLayer = databaseLayer()
