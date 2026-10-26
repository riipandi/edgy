import { Schema } from 'effect'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import { CacheHeader } from '#/kernel/cache.ts'
import { CreateUserRequest, UserResponse, UpdateUserRequest } from './user_schema.ts'
import { UserIdParams } from './user_schema.ts'

export class UsersApi extends HttpApiGroup.make('users')
  .add(
    HttpApiEndpoint.get('listUsers', '/', {
      success: Schema.Array(UserResponse),
      error: HttpApiError.ServiceUnavailable
    }),
    HttpApiEndpoint.get('getUser', '/:id', {
      params: UserIdParams,
      success: HttpApiSchema.WithHeaders(UserResponse, CacheHeader),
      error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
    }),
    HttpApiEndpoint.post('createUser', '/', {
      payload: CreateUserRequest,
      success: UserResponse.pipe(HttpApiSchema.status(201)),
      error: [HttpApiError.Conflict, HttpApiError.ServiceUnavailable]
    }),
    HttpApiEndpoint.patch('updateUser', '/:id', {
      params: UserIdParams,
      payload: UpdateUserRequest,
      success: UserResponse,
      error: [HttpApiError.NotFound, HttpApiError.Conflict, HttpApiError.ServiceUnavailable]
    }),
    HttpApiEndpoint.delete('deleteUser', '/:id', {
      params: UserIdParams,
      success: HttpApiSchema.NoContent,
      error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
    })
  )
  .prefix('/users') {}
