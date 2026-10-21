import { getRequestEvent } from '@solidjs/web'
import type { User, UserView } from './user_schema.ts'

const isServer = typeof window === 'undefined'

// Relative URLs work in the browser. During SSR the render runs inside the
// Effect server that owns /api, so the absolute origin comes from the
// incoming request instead of fetching the app's own host by name.
export const listUsers = async (): Promise<readonly User[]> => {
  return fromResponse(await fetch(apiUrl('/api/users')))
}

export const getUser = async (id: string): Promise<User | UserView> => {
  const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(id)}`))
  if (response.status === 404 || response.status === 400) {
    return {
      name: 'Unknown',
      email: '',
      avatar_url: null,
      role: 0,
      email_verified: 0,
      data: null,
      created_at: '',
      updated_at: ''
    } satisfies UserView
  }
  return fromResponse(response)
}

function fromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

function apiUrl(path: string): string {
  if (!isServer) return path
  const event = getRequestEvent()
  if (event === undefined) return new URL(path, 'http://localhost').href
  return new URL(path, event.request.url).href
}
