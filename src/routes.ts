import { H3 } from 'h3'
import { createUserHandler, getUserHandler, listUsersHandler } from './handler/user_handler.ts'

/**
 * Application router. Kept free of runtime concerns so it can be mounted on
 * any h3-compatible server.
 */
export const routes = (app: H3): H3 =>
  app
    .get('/', () => ({ message: 'All is well' }))
    .get('/users', listUsersHandler)
    .get('/users/:id', getUserHandler)
    .post('/users', createUserHandler)
