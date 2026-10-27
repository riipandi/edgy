// Loader-facing readers. The UserService calls live in user.server.ts;
// these wrappers stay importable from client code.
import { createServerFn } from '@tanstack/react-start'
import { fetchUserPage, fetchUsersPage } from './user.server.ts'

export const listUsers = createServerFn({ method: 'GET' }).handler(() => fetchUsersPage())

export const getUser = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data: id }) => fetchUserPage(id))
