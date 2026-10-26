import type { UserResult } from './user_schema.ts'

export const listUsers = async (): Promise<readonly UserResult[]> => {
  if (import.meta.env.SSR) {
    const { listUsersFromService } = await import('./user_ssr.ts')
    return listUsersFromService()
  }
  return fromResponse<readonly UserResult[]>(await fetch('/api/users'))
}

export const getUser = async (id: string): Promise<UserResult | undefined> => {
  if (import.meta.env.SSR) {
    const { getUserFromService } = await import('./user_ssr.ts')
    return getUserFromService(id)
  }
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`)
  if (response.status === 404 || response.status === 400) return undefined
  return fromResponse<UserResult>(response)
}

export interface UserWriteInput {
  email: string
  name?: string | null
  avatar_url?: string | null
}

export const createUser = async (input: UserWriteInput): Promise<UserResult> =>
  fromResponse<UserResult>(
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
  )

export const updateUser = async (
  id: string,
  patch: Partial<UserWriteInput>
): Promise<UserResult | undefined> => {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch)
  })
  if (response.status === 404 || response.status === 400) return undefined
  return fromResponse<UserResult>(response)
}

// A delete's success envelope carries no data — 200, not 204, since the
// envelope always sends a JSON body.
export const removeUser = async (id: string): Promise<boolean> => {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (response.status === 200) return true
  if (response.status === 404 || response.status === 400) return false
  throw new Error(`API ${response.status}`)
}

// Unwraps the {status, data, metadata} success envelope; an error envelope
// never reaches here because !response.ok is checked first.
function fromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json().then((body: { data: T }) => body.data)
}
