import type { User } from './user_schema.ts'

const unknownUser = {
  id: 'unknown',
  name: 'Unknown',
  email: '',
  avatar_url: null,
  role: 0,
  email_verified: 0,
  data: null,
  disabled: 0,
  created_at: '',
  updated_at: ''
} satisfies User

export const listUsers = async (): Promise<readonly User[]> => {
  if (import.meta.env.SSR) {
    const { listUsersFromService } = await import('./user_ssr.ts')
    return listUsersFromService()
  }
  return fromResponse(await fetch('/api/users'))
}

export const getUser = async (id: string): Promise<User> => {
  if (import.meta.env.SSR) {
    const { getUserFromService } = await import('./user_ssr.ts')
    return (await getUserFromService(id)) ?? unknownUser
  }
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`)
  if (response.status === 404 || response.status === 400) {
    return unknownUser
  }
  return fromResponse(response)
}

function fromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}
