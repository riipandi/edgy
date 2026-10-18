import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { DatabaseService } from '../../database/service.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
  await t.request('/api/users', { method: 'POST', body: { email: 'ada@example.com', name: 'Ada' } })
})
afterAll(() => t.dispose())

/** One ndjson exchange against the app: request in, decoded messages out. */
const call = async (app: TestApp['app'], tag: string, payload: unknown) => {
  const response = await app.fetch(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/ndjson' },
      body: `${JSON.stringify({ _tag: 'Request', id: 1, tag, payload, headers: [] })}\n`
    })
  )
  expect(response.status).toBe(200)
  const text = await response.text()
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown)
}

const exitOf = (messages: readonly unknown[]) =>
  messages.find((message) => (message as { _tag: string })._tag === 'Exit') as {
    _tag: 'Exit'
    exit: { _tag: string; value?: unknown; cause?: readonly unknown[] }
  }

describe('POST /rpc', () => {
  it('answers a procedure call with a success exit carrying the page', async () => {
    const exit = exitOf(await call(t.app, 'userList', { limit: 10 }))
    expect(exit.exit._tag).toBe('Success')
    expect((exit.exit.value as { users: readonly unknown[] }).users).toHaveLength(1)
  })

  it('decodes the payload through the schema, so a bad shape fails the call', async () => {
    const exit = exitOf(await call(t.app, 'userList', { limit: 'not a number' }))
    expect(exit.exit._tag).toBe('Failure')
  })

  it('carries a typed failure when the read fails', async () => {
    const broken = await makeTestApp()
    try {
      await broken.run(
        DatabaseService.use(({ query }) => query((db) => db.schema.dropTable('users').execute()))
      )
      const exit = exitOf(await call(broken.app, 'userList', { limit: 10 }))
      expect(exit.exit._tag).toBe('Failure')
    } finally {
      await broken.dispose()
    }
  })

  it('stays outside the API envelope and outside OpenAPI', async () => {
    // The answers above are ndjson, not the envelope; the generator check proves the latter.
    const response = await t.request('/rpc', { method: 'GET' })
    expect(response.status).toBe(405)
  })
})
