import { Context } from 'effect'
import type { Kysely } from 'kysely'
import type { DB } from './schema.ts'

export class Database extends Context.Service<Database, Kysely<DB>>()('app/Database') {}
