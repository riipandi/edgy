import { defineHandler } from '../kernel/http/handler.ts'
import {
  UserCreateRequestSchema,
  UserCreateResponseSchema,
  UserGetResponseSchema,
  UserIdParamsSchema,
  UserListResponseSchema
} from '../schemas/user_schema.ts'
import { UserService } from '../service/user_service.ts'

/** `GET /users` — list every user. */
export const listUsersHandler = defineHandler({
  response: UserListResponseSchema,
  run: () => UserService.use((users) => users.list)
})

/** `GET /users/:id` — fetch a single user. */
export const getUserHandler = defineHandler({
  params: UserIdParamsSchema,
  response: UserGetResponseSchema,
  run: ({ params }) => UserService.use((users) => users.get(params.id))
})

/** `POST /users` — create a user from a JSON body, answered with `201`. */
export const createUserHandler = defineHandler({
  body: UserCreateRequestSchema,
  response: UserCreateResponseSchema,
  status: 201,
  run: ({ body }) => UserService.use((users) => users.create(body))
})
