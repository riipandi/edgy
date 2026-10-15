import { afterEach, describe, expect, it, vi } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { MISSING_USER_ID } from '../../tests/ids.ts'

let t: TestApp | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await t?.dispose()
  t = undefined
})

/** The lines the app printed through its console logger while `run` ran. */
const printed = async (run: () => Promise<void>): Promise<string[]> => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  await run()
  return lines
}

describe('error reporting', () => {
  it('reports a database failure once, with the request id, and shows the client nothing internal', async () => {
    t = await makeTestApp({ LOG_LEVEL: 'Error' })
    await t.run(
      (await import('../database/service.ts')).DatabaseService.use(({ query }) =>
        query((db) => db.schema.dropTable('users').execute())
      )
    )

    let id = ''
    const lines = await printed(async () => {
      const response = await t!.request('/api/users')
      id = response.headers.get('x-request-id') ?? ''
      const body: any = await response.json()
      expect(response.status).toBe(500)
      expect(body.message).toBe('Database error')
      expect(JSON.stringify(body)).not.toContain('no such table')
    })

    const reports = lines.filter((line) => line.includes('Request failed'))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toContain('ERROR')
    expect(reports[0]).toContain(id)
  })

  it('does not report an expected failure: not found, validation, conflict', async () => {
    t = await makeTestApp({ LOG_LEVEL: 'Error' })
    await t.request('/api/users', { method: 'POST', body: { email: 'dup@example.com' } })

    const lines = await printed(async () => {
      expect((await t!.request(`/api/users/${MISSING_USER_ID}`)).status).toBe(404)
      expect(
        (await t!.request('/api/users', { method: 'POST', body: { email: 'nope' } })).status
      ).toBe(400)
      expect(
        (await t!.request('/api/users', { method: 'POST', body: { email: 'dup@example.com' } }))
          .status
      ).toBe(409)
    })

    expect(lines.filter((line) => line.includes('Request failed'))).toEqual([])
  })
})
