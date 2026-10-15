import { describe, expect, it } from '@effect/vitest'
import { Kysely, sql } from 'kysely'
import { Migrator } from 'kysely/migration'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteDialect } from './dialect/sqlite-dialect.ts'

describe('migrations on SQLite', () => {
  it('are all-or-nothing: a migration that fails halfway leaves no table behind', async () => {
    const db = new Kysely<unknown>({ dialect: new NodeSQLiteDialect(new DatabaseSync(':memory:')) })
    const migrator = new Migrator({
      db,
      provider: {
        getMigrations: async () => ({
          '001_half': {
            up: async (trx: Kysely<unknown>) => {
              await trx.schema.createTable('half').addColumn('id', 'integer').execute()
              throw new Error('fails after creating the table')
            }
          }
        })
      }
    })

    const { error } = await migrator.migrateToLatest()
    expect(String(error)).toContain('fails after creating the table')

    const tables = await sql<{
      name: string
    }>`select name from sqlite_master where name = 'half'`.execute(db)
    expect(tables.rows).toEqual([]) // rolled back, and the migration is not recorded as run
    await db.destroy()
  })

  it('can be run by two processes at once: one applies them, the other finds nothing to do', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edgy-migrate-'))
    try {
      const run = () =>
        new Promise<{ code: number | null; output: string }>((resolve) => {
          const child = spawn(process.execPath, ['./src/main.ts', 'migrate:up'], {
            env: {
              ...process.env,
              DATABASE_PATH: join(dir, 'race.db'),
              OTEL_SDK_DISABLED: 'true',
              LOG_LEVEL: 'Warn'
            }
          })
          let output = ''
          child.stdout.on('data', (chunk) => (output += String(chunk)))
          child.stderr.on('data', (chunk) => (output += String(chunk)))
          child.on('close', (code) => resolve({ code, output }))
        })

      // Before the lock, the second process died on `kysely_migration`'s primary key, every time.
      const results = await Promise.all([run(), run()])
      for (const { code, output } of results) {
        expect({ code, output: code === 0 ? '' : output }).toEqual({ code: 0, output: '' })
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
