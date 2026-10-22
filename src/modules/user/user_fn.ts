import type { User } from './user_schema.ts'

export const listUsers = async (): Promise<readonly User[]> => {
  if (import.meta.env.SSR) {
    const { listUsersFromService } = await import('./user_ssr.ts')
    return listUsersFromService()
  }
  return fromResponse(await fetch('/api/users'))
}

export const getUser = async (id: string): Promise<User | undefined> => {
  if (import.meta.env.SSR) {
    const { getUserFromService } = await import('./user_ssr.ts')
    return getUserFromService(id)
  }
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`)
  if (response.status === 404 || response.status === 400) return undefined
  return fromResponse(response)
}

function fromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}
