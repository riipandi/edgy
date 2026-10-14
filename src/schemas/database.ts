import type { Kysely } from 'kysely'

/**
 * Aggregated database schema.
 *
 * Each `*_schema.ts` file augments this interface via declaration merging
 * (`declare module "./database.ts"`), so the Kysely instance stays fully typed
 * without a central registry to maintain.
 */
export interface Database {}

/** Kysely database handle bound to the aggregated {@link Database} schema. */
export type Db = Kysely<Database>
