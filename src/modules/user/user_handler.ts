import { Effect } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { UserRepositoryError } from './user_repo.ts'
import { parseUserId, UserIdParams } from './user_schema.ts'
import { UserService } from './user_service.ts'

const withPersistenceErrors = <E, R>(
  handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E | UserRepositoryError, R>
) =>
  handler.pipe(
    Effect.catchTag('UserRepositoryError', () =>
      Effect.succeed(
        HttpServerResponse.setStatus(503)(
          HttpServerResponse.jsonUnsafe({ message: 'Service unavailable' })
        )
      )
    )
  )

export const listUsers = withPersistenceErrors(
  Effect.gen(function* () {
    const users = yield* UserService
    return yield* HttpServerResponse.json(yield* users.list())
  })
)

export const findUser = withPersistenceErrors(
  Effect.gen(function* () {
    const params = yield* HttpRouter.schemaPathParams(UserIdParams)
    let id: string
    try {
      id = parseUserId(params.id).toString()
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
)
