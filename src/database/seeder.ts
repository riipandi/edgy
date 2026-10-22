import { Data, Effect } from 'effect'
import type { Kysely } from 'kysely'
import { Database } from './adapter.ts'
import type { DB } from './schema.ts'
import { seedUsers, USER_SEED_COUNT } from './seeders/user_factory.ts'

export class SeederError extends Data.TaggedError('SeederError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

export interface Seeder {
  readonly name: string
  readonly records: number
  readonly run: (db: Kysely<DB>) => Promise<void>
}

/** Seeders, run in order. Registered here rather than discovered from disk so they survive bundling. */
export const SEEDERS: ReadonlyArray<Seeder> = Object.freeze([
  { name: 'users', records: USER_SEED_COUNT, run: seedUsers }
])

/** Runs every seeder in registry order against the acquired database. */
export const runSeeders: Effect.Effect<void, SeederError, Database> = Effect.gen(function* () {
  const { db } = yield* Database
  for (const seeder of SEEDERS) {
    yield* Effect.tryPromise({
      try: () => seeder.run(db),
      catch: (cause) => new SeederError({ cause })
    })
  }
})
