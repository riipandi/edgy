import type { Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'
import { seedUsers, USER_SEED_COUNT } from './user_factory.ts'

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
