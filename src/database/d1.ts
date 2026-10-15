import { Context, Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { ConfigService } from '../kernel/config/service.ts'
import { DatabaseError } from '../kernel/errors.ts'
import { type D1Database } from './dialect/d1-connection.ts'
import { D1Dialect } from './dialect/d1-dialect.ts'
import type { Database } from './schema.ts'
import { DatabaseService, makeDatabaseService, makeQueryLogger } from './service.ts'

/**
 * The D1 binding, provided by whoever owns it: the Worker entry (from its `env`)
 * or, for CLI commands on Node, the local wrangler platform proxy
 * ({@link D1BindingNodeLayer}). Keeping it a service means the database layer never
 * learns where the binding came from.
 */
export class D1Binding extends Context.Service<D1Binding, D1Database>()('D1Binding') {}

/**
 * `DATABASE_DRIVER=d1`: Kysely over a D1 binding. There is nothing to open or
 * close, and D1 has no interactive transactions, so `transaction` fails.
 */
export const D1DatabaseLayer: Layer.Layer<DatabaseService, never, D1Binding> = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const binding = yield* D1Binding
    const log = yield* makeQueryLogger
    const db = new Kysely<Database>({ dialect: new D1Dialect(binding), log })
    return makeDatabaseService(db, { transactions: false })
  })
)

/**
 * Imported through a variable on purpose: a literal `import('wrangler')` would be
 * followed by the bundler and pull wrangler and miniflare (about 20 MB) into the
 * Node server bundle, which never uses them.
 */
const WRANGLER = 'wrangler'

export const isD1Database = (value: unknown): value is D1Database =>
  typeof value === 'object' &&
  value !== null &&
  'prepare' in value &&
  typeof value.prepare === 'function'

/**
 * The D1 binding for CLI commands on Node, taken from wrangler's local platform
 * proxy (miniflare). It reads the same `wrangler.jsonc` and the same persisted
 * state `wrangler dev` uses, so `DATABASE_DRIVER=d1 pnpm app migrate:up` prepares
 * the database `pnpm watch:worker` and `pnpm preview` then serve.
 *
 * `wrangler` is a development dependency and is imported lazily, so neither the
 * Node server nor the Worker ever loads it; the Worker simply never uses this layer. It is local only: it does not
 * reach a remote D1 database.
 */
export const D1BindingNodeLayer: Layer.Layer<D1Binding, DatabaseError, ConfigService> =
  Layer.effect(
    D1Binding,
    Effect.gen(function* () {
      const { database } = yield* ConfigService

      const proxy = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const wrangler: typeof import('wrangler') = await import(WRANGLER)
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
