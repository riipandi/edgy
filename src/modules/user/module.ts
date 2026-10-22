import { Schema } from 'effect'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import { UserSchema, UserIdParams } from './user_schema.ts'

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
