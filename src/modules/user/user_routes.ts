import type { H3Plugin } from 'h3'
import { defineRouteGroup } from '../../kernel/http/router.ts'
import { createUserHandler, getUserHandler, listUsersHandler } from './user_handler.ts'

/** `/users` resource group. Patterns are relative to the prefix; the group mounts under `/api`. */
export const userRoutes: H3Plugin = defineRouteGroup({
  prefix: '/users',
  routes: (r) => {
    r.get('/', listUsersHandler)
    r.get('/:id', getUserHandler)
    r.post('/', createUserHandler)
  }
})
