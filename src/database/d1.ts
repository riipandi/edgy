import { Context, Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { ConfigService } from '../kernel/config/service.ts'
import { DatabaseError } from '../kernel/errors.ts'
import { type D1Database } from './dialect/d1-connection.ts'
import { D1Dialect } from './dialect/d1-dialect.ts'
import type { Database } from './schema.ts'
import { DatabaseService, makeDatabaseService, makeQueryLogger } from './service.ts'

/**
 * The D1 binding, from the Worker's `env` or, on Node, the local wrangler platform proxy
 * ({@link D1BindingNodeLayer}). The database layer does not learn where it came from.
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
      transactions: false,
      singleConnection: false,
      retryReads: true
    })
  })
)

/** Kept in a variable: a literal `import('wrangler')` would bundle wrangler and miniflare (about 20 MB). */
const WRANGLER = 'wrangler'

export const isD1Database = (value: unknown): value is D1Database =>
  typeof value === 'object' &&
  value !== null &&
  'prepare' in value &&
  typeof value.prepare === 'function'

/**
 * D1 binding for Node, from wrangler's local platform proxy (miniflare). It reads the same
 * `wrangler.jsonc` and persisted state as `wrangler dev`, so a migration run here prepares the
 * database the worker mode serves. Local only: it does not reach a remote D1 database.
 *
 * wrangler is a development dependency, imported lazily so the Node server never loads it.
 */
export const D1BindingNodeLayer: Layer.Layer<D1Binding, DatabaseError, ConfigService> =
  Layer.effect(
    D1Binding,
    Effect.gen(function* () {
      const { database } = yield* ConfigService

      const proxy = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const wrangler: typeof import('wrangler') = await import(/* @vite-ignore */ WRANGLER)
            return wrangler.getPlatformProxy()
          },
          catch: (cause) => new DatabaseError({ cause })
        }),
        (platform) => Effect.promise(() => platform.dispose())
      )

      const binding: unknown = proxy.env[database.d1Binding]
      if (!isD1Database(binding)) {
        return yield* new DatabaseError({
          cause: new Error(
            `No D1 binding named "${database.d1Binding}" in wrangler.jsonc (set D1_BINDING)`
          )
        })
      }
      return binding
    })
  )

export type { D1Database } from './dialect/d1-connection.ts'
