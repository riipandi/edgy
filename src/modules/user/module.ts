import { Effect, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { CacheHeader } from '#/kernel/cache.ts'
import type { api } from '#/kernel/http/api.ts'
import { parseUserId, PublicUserSchema, toPublicUser, UserIdParams } from './user_schema.ts'
import { UserService } from './user_service.ts'

// `?nocache=1` skips the cache for that request: no read, no fill.
const nocacheRequested = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, 'http://localhost').searchParams.get('nocache') === '1'

export class UsersApi extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.get('listUsers', '/users', {
    success: Schema.Array(PublicUserSchema),
    error: HttpApiError.ServiceUnavailable
  }),
  HttpApiEndpoint.get('getUser', '/users/:id', {
    params: UserIdParams,
    success: HttpApiSchema.WithHeaders(PublicUserSchema, CacheHeader),
    error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable]
  })
) {}

export const usersHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'users', (handlers) =>
    handlers
      .handle('listUsers', () =>
        Effect.flatMap(UserService, (service) =>
          service.list().pipe(
            Effect.map((users) => users.map(toPublicUser)),
            Effect.catchTag('UserRepositoryError', () =>
              Effect.fail(new HttpApiError.ServiceUnavailable())
            )
          )
        )
      )
      .handle('getUser', ({ params }) =>
        Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
          Effect.flatMap(UserService, (service) =>
            service.find(parseUserId(params.id), nocacheRequested(request)).pipe(
              Effect.flatMap((result) =>
                result.user === undefined
                  ? Effect.fail(new HttpApiError.NotFound())
                  : Effect.succeed(
                      HttpApiSchema.withHeaders({
                        body: toPublicUser(result.user),
                        headers: { 'x-cache': result.cache }
                      })
                    )
              ),
              Effect.catchTag('UserRepositoryError', () =>
                Effect.fail(new HttpApiError.ServiceUnavailable())
              )
            )
          )
        )
      )
  )
