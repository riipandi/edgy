import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { userRow } from '../../tests/ids.ts'
import { DatabaseService } from './service.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
})
afterAll(() => t.dispose())

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const countOf = (email: string) =>
  t.run(
    DatabaseService.use(({ query }) =>
      query((db) =>
        db
          .selectFrom('users')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .where('email', '=', email)
          .executeTakeFirstOrThrow()
      )
    )
  )

describe('a query whose request was cancelled while it waited for the connection', () => {
  it('never runs, and the connection stays usable', async () => {
    // Something holds the single connection: a transaction that is waiting on `release`.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const holder = t.run(
      DatabaseService.use(({ transaction }) =>
        transaction(async () => {
          await gate
        })
      )
    )
    await sleep(20)

    // A write queues behind it, and its request gives up (the timeout interrupts the fiber).
    const write = await t.run(
      DatabaseService.use(({ query }) =>
        query((db) => db.insertInto('users').values(userRow('abandoned@example.com')).execute())
      ).pipe(Effect.timeoutOption('50 millis'))
    )
    expect(Option.isNone(write)).toBe(true)

    release()
    await holder

    // Before the fix the abandoned write ran now, so a retried request created the user twice.
    expect((await countOf('abandoned@example.com')).n).toBe(0)

    await t.run(
      DatabaseService.use(({ query }) =>
        query((db) => db.insertInto('users').values(userRow('after@example.com')).execute())
      )
    )
    expect((await countOf('after@example.com')).n).toBe(1)
  })

  it('still runs a query that is merely queued, in order', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const holder = t.run(
      DatabaseService.use(({ transaction }) =>
        transaction(async () => {
          await gate
        })
      )
    )
    await sleep(20)

    const queued = t.run(
      DatabaseService.use(({ query }) =>
        query((db) => db.insertInto('users').values(userRow('queued@example.com')).execute())
      )
    )
    await sleep(20)
    release()
    await Promise.all([holder, queued])

    expect((await countOf('queued@example.com')).n).toBe(1)
  })
})
