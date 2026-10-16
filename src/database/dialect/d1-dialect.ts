/**
 * Adapted from https://github.com/aidenwallis/kysely-d1 (MIT).
 *
 * Differs from upstream: the binding type is declared locally, and the stock SQLite adapter and
 * compiler are reused. The introspector is replaced because Kysely reads columns through
 * `pragma_table_info`, which D1 rejects with `SQLITE_AUTH`.
 */
import type {
  DatabaseIntrospector,
  DatabaseMetadataOptions,
  Dialect,
  Driver,
  SchemaMetadata,
  TableMetadata
} from 'kysely'
import { Kysely, SqliteAdapter, SqliteQueryCompiler, sql } from 'kysely'
import type { D1Database } from './d1-connection.ts'
import { D1Driver } from './d1-driver.ts'

/**
 * Lists table names from `sqlite_master`; `columns` is always empty. Anything that needs column
 * metadata cannot run on D1.
 */
class D1Introspector implements DatabaseIntrospector {
  readonly #db: Kysely<unknown>

  constructor(db: Kysely<unknown>) {
    this.#db = db
  }

  async getSchemas(): Promise<SchemaMetadata[]> {
    return []
  }

  async getTables(
    options: DatabaseMetadataOptions = { withInternalKyselyTables: false }
  ): Promise<TableMetadata[]> {
    const internal = options.withInternalKyselyTables ? '' : 'kysely_%'
    const { rows } = await sql<{ name: string; type: string }>`
      select name, type from sqlite_master
      where type in ('table', 'view')
        and name not like 'sqlite_%'
        and name not like ${internal}
      order by name`.execute(this.#db)

    return rows.map((row) => ({
      name: row.name,
      isView: row.type === 'view',
      isForeign: false,
      columns: []
    }))
  }
}

/** Kysely dialect for Cloudflare D1, on Workers and locally through wrangler. */
export class D1Dialect implements Dialect {
  readonly #database: D1Database

  constructor(database: D1Database) {
    this.#database = database
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new D1Driver(this.#database)
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new D1Introspector(db)
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler()
  }
}
