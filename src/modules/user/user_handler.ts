import { Effect } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { parseUserId, UserIdParams } from './user_schema.ts'
import { UserService } from './user_service.ts'

export const listUsers = Effect.gen(function* () {
  const users = yield* UserService
  return yield* HttpServerResponse.json(yield* users.list())
})

export const findUser = Effect.gen(function* () {
  const params = yield* HttpRouter.schemaPathParams(UserIdParams)
  let id: string
  try {
    id = parseUserId(params.id)
  } catch {
    return HttpServerResponse.setStatus(400)(
      HttpServerResponse.jsonUnsafe({ message: 'Invalid user id' })
    )
  }
  const users = yield* UserService
  const user = yield* users.find(id)
  if (user === undefined) {
    return HttpServerResponse.setStatus(404)(
      HttpServerResponse.jsonUnsafe({ message: 'Not found' })
    )
  }
  return yield* HttpServerResponse.json(user)
})
