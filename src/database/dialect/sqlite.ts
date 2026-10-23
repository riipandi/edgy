import { Kysely, SqliteDialect } from 'kysely'
import type { LogEvent, SqliteDatabase } from 'kysely'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
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

export const openDatabase = (filename: string, log?: (event: LogEvent) => void): Kysely<DB> => {
  const location = filename === ':memory:' ? filename : path.resolve(filename)
  if (location !== ':memory:') {
    const directory = path.dirname(location)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
      chmodSync(directory, 0o775)
    }
  }
  // node:sqlite defaults the busy timeout to 0: a concurrent writer gets
  // SQLITE_BUSY immediately instead of waiting out the lock.
  const sqlite = new DatabaseSync(location, { timeout: 5_000 })
  // The file is created with the process umask (0644), so on a shared host any
  // local user could read the whole database. Narrow it to the owner. The -wal
  // and -shm sidecars inherit the mode of the file they attach to.
  if (location !== ':memory:') chmodSync(location, 0o600)
  sqlite.exec('pragma foreign_keys = on')
  sqlite.exec('pragma journal_mode = wal')
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: adapt(sqlite) }),
    ...(log === undefined ? {} : { log })
  })
}
