import { Schema } from 'effect'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import { EmptySuccessEnvelope, ErrorEnvelope, SuccessEnvelope } from '#/kernel/http/envelope.ts'
import {
  ApiConflictError,
  ApiNotFoundError,
  ApiServiceUnavailableError,
  ApiValidationError
} from '#/kernel/http/errors.ts'
import { PaginationFields } from '#/kernel/http/pagination.ts'
import { CreateUserRequest, UserResponse, UpdateUserRequest } from './user_schema.ts'
import { UserIdParams } from './user_schema.ts'

const ListUsersQuery = Schema.Struct({
  ...PaginationFields,
  sort_by: Schema.optional(Schema.Literals(['id', 'created_at']))
})

export class UsersApi extends HttpApiGroup.make('users')
  .add(
    HttpApiEndpoint.get('listUsers', '/', {
      query: ListUsersQuery,
      success: SuccessEnvelope(Schema.Array(UserResponse)),
      error: [
        ErrorEnvelope(ApiValidationError, 400),
        ErrorEnvelope(ApiServiceUnavailableError, 503)
      ]
    }),
    HttpApiEndpoint.get('getUser', '/:id', {
      params: UserIdParams,
      success: SuccessEnvelope(UserResponse),
      error: [ErrorEnvelope(ApiNotFoundError, 404), ErrorEnvelope(ApiServiceUnavailableError, 503)]
    }),
    HttpApiEndpoint.post('createUser', '/', {
      payload: CreateUserRequest,
      success: SuccessEnvelope(UserResponse).pipe(HttpApiSchema.status(201)),
      error: [ErrorEnvelope(ApiConflictError, 409), ErrorEnvelope(ApiServiceUnavailableError, 503)]
    }),
    HttpApiEndpoint.patch('updateUser', '/:id', {
      params: UserIdParams,
      payload: UpdateUserRequest,
      success: SuccessEnvelope(UserResponse),
      error: [
        ErrorEnvelope(ApiNotFoundError, 404),
        ErrorEnvelope(ApiConflictError, 409),
        ErrorEnvelope(ApiServiceUnavailableError, 503)
      ]
    }),
    HttpApiEndpoint.delete('deleteUser', '/:id', {
      params: UserIdParams,
      success: EmptySuccessEnvelope,
      error: [ErrorEnvelope(ApiNotFoundError, 404), ErrorEnvelope(ApiServiceUnavailableError, 503)]
    })
  )
  .prefix('/users') {}
