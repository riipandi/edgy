import { describe, expect, it } from 'vite-plus/test'
import { createUser, getUser, listUsers, removeUser, updateUser } from './user_fn.ts'

const user = {
  id: 'user_x',
  email: 'a@example.com',
  name: 'A',
  avatar_url: null,
  role: 10,
  created_at: '2026-01-01 00:00:00'
}

interface Call {
  readonly url: string
  readonly method: string
  readonly body?: unknown
}

const withFetch = (respond: (call: Call) => Response, run: () => Promise<void>): Promise<void> => {
  const original = globalThis.fetch
  const calls: Array<Call> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const call: Call = { url, method: init?.method ?? 'GET', body }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return run().finally(() => {
    globalThis.fetch = original
  })
}

describe('the user api client', () => {
  it('lists users through GET /api/users', async () => {
    await withFetch(
      () => Response.json([user]),
      async () => {
        expect(await listUsers()).toEqual([user])
      }
    )
  })

  it('maps 404 and 400 of a detail read to undefined', async () => {
    await withFetch(
      () => new Response('no', { status: 404 }),
      async () => {
        expect(await getUser('user_x')).toBeUndefined()
      }
    )
    await withFetch(
      () => new Response('bad', { status: 400 }),
      async () => {
        expect(await getUser('bad id')).toBeUndefined()
      }
    )
  })

  it('posts the create payload as JSON', async () => {
    let call: Call | undefined
    await withFetch(
      (seen) => {
        call = seen
        return Response.json(user, { status: 201 })
      },
      async () => {
        expect(await createUser({ email: 'a@example.com', name: 'A' })).toEqual(user)
        expect(call).toMatchObject({
          url: '/api/users',
          method: 'POST',
          body: { email: 'a@example.com', name: 'A' }
        })
      }
    )
  })

  it('sends only the patch and maps a missing user to undefined', async () => {
    let call: Call | undefined
    await withFetch(
      (seen) => {
        call = seen
        return Response.json(user)
      },
      async () => {
        expect(await updateUser('user_x', { name: 'B' })).toEqual(user)
        expect(call).toMatchObject({
          url: '/api/users/user_x',
          method: 'PATCH',
          body: { name: 'B' }
        })
      }
    )
    await withFetch(
      () => new Response('no', { status: 404 }),
      async () => {
        expect(await updateUser('user_x', { name: 'B' })).toBeUndefined()
      }
    )
  })

  it('reports delete success and miss without throwing', async () => {
    await withFetch(
      () => new Response(null, { status: 204 }),
      async () => {
        expect(await removeUser('user_x')).toBe(true)
      }
    )
    await withFetch(
      () => new Response(null, { status: 404 }),
      async () => {
        expect(await removeUser('user_x')).toBe(false)
      }
    )
  })

  it('throws on an unexpected status', async () => {
    await withFetch(
      () => new Response(null, { status: 409 }),
      async () => {
        await expect(createUser({ email: 'a@example.com' })).rejects.toThrow('API 409')
      }
    )
  })
})
