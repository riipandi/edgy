import { Effect } from 'effect'
import { getRouterParams, type H3Event, readBody } from 'h3'
import { decode } from '../kernel/http/decode.ts'
import { runEffect } from '../kernel/http/responder.ts'
import {
  UserCreateRequestSchema,
  UserCreateResponseSchema,
  UserGetResponseSchema,
  UserIdParamsSchema,
  UserListResponseSchema
} from '../schemas/user_schema.ts'
import { UserService } from '../service/user_service.ts'

/** `GET /users` — list every user. */
export function listUsersHandler(event: H3Event) {
  return runEffect(
    event,
    UserService.use((users) => users.list),
    { response: UserListResponseSchema }
  )
}

/** `GET /users/:id` — fetch a single user. */
export function getUserHandler(event: H3Event) {
  return runEffect(
    event,
    Effect.gen(function* () {
      const { id } = yield* decode(UserIdParamsSchema)(getRouterParams(event))
      const users = yield* UserService
      return yield* users.get(id)
    }),
    { response: UserGetResponseSchema }
  )
}

/**
 * `POST /users` — create a user from a JSON body, answered with `201`.
 *
 * Malformed JSON is rejected by h3 itself (400) before the program runs; a
 * well-formed body that fails the schema surfaces as `ValidationError`.
 */
export async function createUserHandler(event: H3Event) {
  const body = await readBody(event)
  return runEffect(
    event,
    Effect.gen(function* () {
      const input = yield* decode(UserCreateRequestSchema)(body)
      const users = yield* UserService
      return yield* users.create(input)
    }),
    { response: UserCreateResponseSchema, successStatus: 201 }
  )
}
