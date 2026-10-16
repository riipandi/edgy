import { Context, Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { type D1Database } from './dialect/d1-connection.ts'
import { D1Dialect } from './dialect/d1-dialect.ts'
import type { Database } from './schema.ts'
import { DatabaseService, makeDatabaseService, makeQueryLogger } from './service.ts'

/**
 * The D1 binding, from the Worker's `env` or, on Node, the local wrangler platform proxy
 * (`d1BindingNodeLayer`). The database layer does not learn where it came from.
 */
export class D1Binding extends Context.Service<D1Binding, D1Database>()('D1Binding') {}

/** `DATABASE_DRIVER=d1`. Nothing to open or close. D1 has no interactive transactions. */
export const D1DatabaseLayer: Layer.Layer<DatabaseService, never, D1Binding> = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const binding = yield* D1Binding
    const log = yield* makeQueryLogger
    const db = new Kysely<Database>({ dialect: new D1Dialect(binding), log })
    return makeDatabaseService(db, {
      singleConnection: false,
      retryReads: true
    })
  })
)

export const isD1Database = (value: unknown): value is D1Database =>
  typeof value === 'object' &&
  value !== null &&
  'prepare' in value &&
  typeof value.prepare === 'function'

export type { D1Database } from './dialect/d1-connection.ts'
