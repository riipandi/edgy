import { Effect, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import type { api } from '#/kernel/http/api.ts'
import { parseUserId, UserSchema, UserIdParams } from './user_schema.ts'
import { UserService } from './user_service.ts'

export class UsersApi extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.get('listUsers', '/users', {
    success: Schema.Array(UserSchema),
    error: HttpApiError.ServiceUnavailable
  }),
  HttpApiEndpoint.get('getUser', '/users/:id', {
    params: UserIdParams,
    success: UserSchema,
    error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
  })
) {}

export const usersHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'users', (handlers) =>
    handlers
      .handle('listUsers', () =>
        Effect.flatMap(UserService, (service) =>
          service
            .list()
            .pipe(
              Effect.catchTag('UserRepositoryError', () =>
                Effect.fail(new HttpApiError.ServiceUnavailable())
              )
            )
        )
      )
      .handle('getUser', ({ params }) =>
        Effect.flatMap(UserService, (service) =>
          service.find(parseUserId(params.id)).pipe(
            Effect.flatMap((user) =>
              user === undefined ? Effect.fail(new HttpApiError.NotFound()) : Effect.succeed(user)
            ),
            Effect.catchTag('UserRepositoryError', () =>
              Effect.fail(new HttpApiError.ServiceUnavailable())
            )
          )
        )
      )
  )
