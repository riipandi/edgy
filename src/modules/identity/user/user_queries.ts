// Page data as query options. The server functions stay the only path across
// the client/server boundary.
import { queryOptions } from '@tanstack/react-query'
import { getUser, listUsers } from './user_fns.ts'

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: () => listUsers()
})

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['users', id],
    queryFn: async () => {
      const data = await getUser({ data: id })
      // A missing user is data, not an error, so the not-found body stays
      // inside the shell and the loader can still answer 404.
      return data?.user ?? null
    }
  })
