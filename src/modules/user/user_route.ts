import { Schema } from 'effect'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import { CacheHeader } from '#/kernel/cache.ts'
import { CreateUserRequest, UserResponse, UpdateUserRequest } from './user_schema.ts'
import { UserIdParams } from './user_schema.ts'

export class UsersApi extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.get('listUsers', '/users', {
    success: Schema.Array(UserResponse),
    error: HttpApiError.ServiceUnavailable
  }),
  HttpApiEndpoint.get('getUser', '/users/:id', {
    params: UserIdParams,
    success: HttpApiSchema.WithHeaders(UserResponse, CacheHeader),
    error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
  }),
  HttpApiEndpoint.post('createUser', '/users', {
    payload: CreateUserRequest,
    success: UserResponse.pipe(HttpApiSchema.status(201)),
    error: [HttpApiError.Conflict, HttpApiError.ServiceUnavailable]
  }),
  HttpApiEndpoint.patch('updateUser', '/users/:id', {
    params: UserIdParams,
    payload: UpdateUserRequest,
    success: UserResponse,
    error: [HttpApiError.NotFound, HttpApiError.Conflict, HttpApiError.ServiceUnavailable]
  }),
  HttpApiEndpoint.delete('deleteUser', '/users/:id', {
    params: UserIdParams,
    success: HttpApiSchema.NoContent,
    error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
  })
) {}
