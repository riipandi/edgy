import { Kysely, SqliteDialect } from 'kysely'
import type { SqliteDatabase } from 'kysely'
import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import type { DB } from '#/database/schema.ts'

const adapt = (db: DatabaseSync): SqliteDatabase => ({
  close: () => {
    db.close()
  },
  prepare: (sql: string) => {
    const statement: StatementSync = db.prepare(sql)
    const reader = statement.columns().length > 0
    const bind = (parameters: readonly unknown[]) => parameters as SQLInputValue[]
    return {
      reader,
      all: (parameters) => statement.all(...bind(parameters)),
      run: (parameters) => statement.run(...bind(parameters)),
      iterate: (parameters) => statement.iterate(...bind(parameters))
    }
  }
})

export const openDatabase = (filename: string): Kysely<DB> => {
  const location = filename === ':memory:' ? filename : path.resolve(filename)
  if (location !== ':memory:') {
    const directory = path.dirname(location)
    mkdirSync(directory, { recursive: true })
    chmodSync(directory, 0o775)
  }
  const sqlite = new DatabaseSync(location)
  sqlite.exec('pragma foreign_keys = on')
  sqlite.exec('pragma journal_mode = wal')
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: adapt(sqlite) })
  })
}
