import { Data } from 'effect'
import type { Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'
import { seedUsers, USER_SEED_COUNT } from './user_factory.ts'

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

export const SEEDERS: readonly Seeder[] = Object.freeze([
  { name: 'users', records: USER_SEED_COUNT, run: seedUsers }
])

export const runSeeders = async (db: Kysely<DB>): Promise<void> => {
  for (const seeder of SEEDERS) await seeder.run(db)
}
