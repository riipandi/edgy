/**
 * Aggregated database schema.
 *
 * Each `*_schema.ts` file augments this interface via declaration merging
 * (`declare module "./schema.ts"`), so the Kysely instance stays fully typed
 * without a central registry to maintain.
 */
export interface Database {}
