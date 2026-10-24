import { spawn } from 'node:child_process'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { LOCAL_CONNECT_OPTIONS, openTursoDatabase } from './dialect.ts'

interface Row {
  readonly id: number
  readonly name: string
}

const schema = (db: Awaited<ReturnType<typeof openTursoDatabase>>) =>
  db.schema
    .createTable('probe')
    .addColumn('id', 'integer', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .execute()

const opened: Array<Awaited<ReturnType<typeof openTursoDatabase>>> = []

const open = async (name: string) => {
  const db = await openTursoDatabase({ kind: 'local', path: testDatabasePath(name) })
  opened.push(db)
  await schema(db)
  return db
}

afterAll(async () => {
  await Promise.all(opened.map((db) => db.destroy()))
})

describe('turso dialect over a local database', () => {
  it('answers a query and reports the rows', async () => {
    const db = await open('dialect-query.db')
    const rows = await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()
    expect(rows).toEqual([])
  })

  it('reports numAffectedRows and insertId on an insert', async () => {
    const db = await open('dialect-insert.db')
    const result = await db
      .insertInto('probe' as never)
      .values({ id: 7, name: 'seven' } as never)
      .executeTakeFirst()
    expect(result.numInsertedOrUpdatedRows).toBe(1n)
    expect(result.insertId).toBe(7n)
  })

  it('counts an update through numUpdatedRows', async () => {
    const db = await open('dialect-update.db')
    await db
      .insertInto('probe' as never)
      .values([
        { id: 1, name: 'one' },
        { id: 2, name: 'two' }
      ] as never)
      .execute()
    const result = await db
      .updateTable('probe' as never)
      .set({ name: 'renamed' } as never)
      .where('id' as never, '>', 0 as never)
      .executeTakeFirst()
    expect(result.numUpdatedRows).toBe(2n)
  })

  it('keeps a committed transaction and discards a rolled-back one', async () => {
    const db = await open('dialect-transaction.db')
    await db.transaction().execute((trx) =>
      trx
        .insertInto('probe' as never)
        .values({ id: 1, name: 'kept' } as never)
        .execute()
    )
    await db
      .transaction()
      .execute(async (trx) => {
        await trx
          .insertInto('probe' as never)
          .values({ id: 2, name: 'dropped' } as never)
          .execute()
        throw new Error('roll back')
      })
      .catch(() => undefined)

    const rows = (await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()) as Row[]
    expect(rows).toEqual([{ id: 1, name: 'kept' }])
  })

  it('holds the connection for the whole transaction window', async () => {
    const db = await open('dialect-lock.db')
    let committedAt = 0
    const window = db.transaction().execute(async (trx) => {
      await trx
        .insertInto('probe' as never)
        .values({ id: 1, name: 'uncommitted' } as never)
        .execute()
      await new Promise((resolve) => setTimeout(resolve, 120))
      committedAt = performance.now()
    })

    const readAt = performance.now()
    const rows = (await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()) as Row[]
    const readDone = performance.now()
    await window

    // Kysely's ConnectionMutex (SqliteAdapter reports no multiple connections)
    // makes the read wait for the transaction instead of slipping inside it.
    expect(rows).toEqual([{ id: 1, name: 'uncommitted' }])
    expect(readDone).toBeGreaterThanOrEqual(committedAt)
    expect(readDone - readAt).toBeGreaterThan(100)
  })

  it('streams a select in chunks', async () => {
    const db = await open('dialect-stream.db')
    await db
      .insertInto('probe' as never)
      .values([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' }
      ] as never)
      .execute()

    const chunks: Row[][] = []
    for await (const chunk of db
      .selectFrom('probe' as never)
      .selectAll()
      .stream(2) as AsyncIterable<Row>) {
      chunks.push([chunk])
    }
    expect(chunks.flat().map((row) => row.id)).toEqual([1, 2, 3])
  })
})

describe('turso dialect guards', () => {
  it('refuses a file: URI that reached the path slot', async () => {
    await expect(openTursoDatabase({ kind: 'local', path: 'file:./somewhere.db' })).rejects.toThrow(
      /expects a path/
    )
  })
})

describe('turso dialect over a remote database', () => {
  // The remote transport is the only place a token leaves the process, so the
  // request shape is asserted against a stub instead of a live database. The
  // client speaks the cursor protocol: an NDJSON stream whose first line is the
  // cursor response and whose remaining lines are statement entries.
  const captured: Array<{ url: string; init: RequestInit }> = []
  const original = globalThis.fetch
  // A sequence statement (BEGIN/COMMIT/ROLLBACK) listed here answers with a
  // server error, which is what one network blip at the worst moment looks like.
  const failingSequences = new Set<string>()

  const entries = (sql: string): string => {
    const lines: unknown[] = [{ baton: null, base_url: null }]
    if (/^\s*select/i.test(sql)) {
      lines.push(
        { type: 'step_begin', step: 0, cols: [{ name: 'id', decltype: 'INTEGER' }] },
        { type: 'row', step: 0, row: [{ type: 'integer', value: '1' }] },
        { type: 'step_end', step: 0, affected_row_count: 0 }
      )
    } else {
      lines.push(
        { type: 'step_begin', step: 0 },
        {
          type: 'step_end',
          step: 0,
          affected_row_count: 1,
          last_insert_rowid: '1'
        }
      )
    }
    return lines.map((line) => `${JSON.stringify(line)}\n`).join('')
  }

  const pipeline = (): Response =>
    new Response(
      JSON.stringify({
        baton: null,
        base_url: null,
        results: [
          { type: 'ok', response: { type: 'sequence' } },
          { type: 'ok', response: { type: 'get_autocommit', is_autocommit: true } }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )

  beforeEach(() => {
    captured.length = 0
    failingSequences.clear()
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof Request ? input.url : input.toString()
      captured.push({ url: requestUrl, init: init ?? {} })
      const rawBody = typeof init?.body === 'string' ? init.body : '{}'
      const body = JSON.parse(rawBody) as {
        batch?: { steps?: Array<{ stmt?: { sql?: string } }> }
        requests?: Array<{ type: string; sql?: string }>
      }
      if (requestUrl.includes('/v3/pipeline')) {
        const sequence = body.requests?.find((request) => request.type === 'sequence')?.sql ?? ''
        if (failingSequences.has(sequence.trim().toUpperCase()))
          return new Response(JSON.stringify({ error: 'connection reset' }), { status: 500 })
        return pipeline()
      }
      const sql = body.batch?.steps?.[0]?.stmt?.sql ?? ''
      return new Response(entries(sql), {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' }
      })
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = original
  })

  const remote = (url: string) => openTursoDatabase({ kind: 'remote', url, token: 'the-token' })

  it('normalizes libsql:// and turso:// to https and sends the bearer token', async () => {
    for (const scheme of ['libsql://probe.turso.io', 'turso://probe.turso.io']) {
      captured.length = 0
      const db = await remote(scheme)
      await db
        .selectFrom('probe' as never)
        .selectAll()
        .execute()
      await db.destroy()

      const first = captured[0]
      expect(first).toBeDefined()
      expect(first?.url.startsWith('https://probe.turso.io/')).toBe(true)
      const headers = new Headers(first?.init.headers)
      expect(headers.get('authorization')).toBe('Bearer the-token')
    }
  })

  it('sends the compiled statement and its parameters', async () => {
    const db = await remote('libsql://probe.turso.io')
    await db
      .selectFrom('probe' as never)
      .selectAll()
      .where('id' as never, '=', 7 as never)
      .execute()
    await db.destroy()

    // `init.body` is already the NDJSON request payload, so it is read as text.
    const rawBody = captured[0]?.init.body
    const body = typeof rawBody === 'string' ? rawBody : ''
    expect(body).toContain('probe')
    // The bound value travels as a typed parameter, not interpolated SQL.
    expect(body).toContain('"type":"integer"')
    expect(body).toContain('"value":"7"')
  })

  it('maps the response rows into a Kysely result', async () => {
    const db = await remote('libsql://probe.turso.io')
    const rows = (await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()) as Array<{
      id: number
    }>
    await db.destroy()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(1)
    // The client returns arrays carrying the column names as non-enumerable
    // properties; a row must be a plain object, or every API response would
    // serialize as `[1]` instead of `{"id":1}`.
    expect(Array.isArray(rows[0])).toBe(false)
    expect(JSON.stringify(rows[0])).toBe('{"id":1}')
  })

  it('reports the affected rows and insert id of a write', async () => {
    const db = await remote('libsql://probe.turso.io')
    const result = await db
      .insertInto('probe' as never)
      .values({ id: 1 } as never)
      .executeTakeFirst()
    await db.destroy()
    expect(result.numInsertedOrUpdatedRows).toBe(1n)
    expect(result.insertId).toBe(1n)
  })

  it('keeps the connection usable after a failed commit', async () => {
    const db = await remote('libsql://probe.turso.io')
    failingSequences.add('COMMIT')

    // The client closes the transaction session before it rethrows, so a slot
    // that is only cleared after the await keeps a closed handle — and every
    // later statement would fail with "Transaction is closed" instead of the
    // network error that actually happened.
    const failure = await db
      .transaction()
      .execute((trx) =>
        trx
          .insertInto('probe' as never)
          .values({ id: 1 } as never)
          .execute()
      )
      .then(() => undefined)
      .catch((error: Error) => error)
    expect(failure?.message).not.toContain('Transaction is closed')

    const rows = await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()
    expect(rows).toHaveLength(1)
    await db.destroy()
  })

  it('does not mask the cause when the rollback fails too', async () => {
    const db = await remote('libsql://probe.turso.io')
    failingSequences.add('ROLLBACK')

    const failure = await db
      .transaction()
      .execute(async (trx) => {
        await trx
          .insertInto('probe' as never)
          .values({ id: 1 } as never)
          .execute()
        throw new Error('the transaction body failed')
      })
      .then(() => undefined)
      .catch((error: Error) => error)
    expect(failure?.message).toBe('the transaction body failed')

    const rows = await db
      .selectFrom('probe' as never)
      .selectAll()
      .execute()
    expect(rows).toHaveLength(1)
    await db.destroy()
  })
})

describe('turso dialect multi-process access', () => {
  it('lets a second process open the file while the first holds it', async () => {
    const path = testDatabasePath('dialect-multiprocess.db')
    const first = await openTursoDatabase({ kind: 'local', path })
    await first.schema
      .createTable('probe')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .execute()
    await first
      .insertInto('probe' as never)
      .values({ id: 1 } as never)
      .execute()

    // A second *process* is what the container healthcheck and a concurrent
    // migration run are; the engine's default exclusive lock refuses it, and
    // `multiprocess_wal` is the mode both sides must agree on.
    const script = `
      const { connect } = await import('@tursodatabase/database')
      const db = await connect(${JSON.stringify(path)}, ${JSON.stringify(LOCAL_CONNECT_OPTIONS)})
      const rows = await db.all('select count(*) as n from probe')
      await db.close()
      console.log(JSON.stringify(rows))
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd()
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += String(chunk)))
    const code = await new Promise((resolve) => child.on('exit', resolve))

    await first.destroy()
    expect(code).toBe(0)
    expect(output.trim()).toBe('[{"n":1}]')
  })
})
