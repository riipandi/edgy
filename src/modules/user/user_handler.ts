import { defineHandler, definePagedHandler } from '../../kernel/http/handler.ts'
import { toPageRequest } from '../../kernel/http/pagination.ts'
import {
  UserCreateRequestSchema,
  UserCreateResponseSchema,
  UserGetResponseSchema,
  UserIdParamsSchema,
  UserListItemSchema,
  DEFAULT_SORT,
  UserListQuerySchema
} from './user_schema.ts'
import { UserService } from './user_service.ts'

/** `GET /users`: one page of users, sorted by `id` unless `sort_by` or `sort_order` say otherwise. */
export const listUsersHandler = definePagedHandler({
  summary: 'List users, a page at a time',
  query: UserListQuerySchema,
  items: UserListItemSchema,
  run: ({ query }) => UserService.use((users) => users.list(toPageRequest(query, DEFAULT_SORT)))
})

/** `GET /users/:id`: a single user by id. */
export const getUserHandler = defineHandler({
  summary: 'Get one user by id',
  params: UserIdParamsSchema,
  response: UserGetResponseSchema,
  run: ({ params }) => UserService.use((users) => users.get(params.id))
})

/** `POST /users`: creates a user from a JSON body, answered with `201`. */
export const createUserHandler = defineHandler({
  summary: 'Create a user',
  body: UserCreateRequestSchema,
  response: UserCreateResponseSchema,
  status: 201,
  run: ({ body }) => UserService.use((users) => users.create(body))
})
