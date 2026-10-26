import { Effect } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig } from '#/kernel/config/config.ts'
import type { api } from '#/kernel/http/api.ts'
import { parseUserId, toUserResult } from './user_schema.ts'
import { UserService } from './user_service.ts'

// `?nocache=1` skips the cache for that request: no read, no fill.
const nocacheRequested = (request: HttpServerRequest.HttpServerRequest, baseUrl: string) =>
  new URL(request.url, baseUrl).searchParams.get('nocache') === '1'

// A factory, not a module-scope layer: building the group layer eagerly would
// make the `api` value import a runtime cycle (api.ts -> module -> here).
export const usersHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'users', (handlers) =>
    handlers
      .handle('listUsers', () =>
        Effect.flatMap(UserService, (service) =>
          service.list().pipe(
            Effect.map((users) => users.map(toUserResult)),
            Effect.catchTag('UserRepositoryError', () =>
              Effect.fail(new HttpApiError.ServiceUnavailable())
            )
          )
        )
      )
      .handle('getUser', ({ params }) =>
        Effect.flatMap(AppConfig, (config) =>
          Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
            Effect.flatMap(UserService, (service) =>
              service
                .find(parseUserId(params.id), nocacheRequested(request, config.app.baseUrl))
                .pipe(
                  Effect.flatMap((result) =>
                    result.user === undefined
                      ? Effect.fail(new HttpApiError.NotFound())
                      : Effect.succeed(
                          HttpApiSchema.withHeaders({
                            body: toUserResult(result.user),
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
      .handle('createUser', ({ payload }) =>
        Effect.flatMap(UserService, (service) =>
          service
            .create({
              email: payload.email,
              name: payload.name ?? null,
              avatar_url: payload.avatar_url ?? null
            })
            .pipe(
              Effect.map(toUserResult),
              Effect.catchTag('UserEmailConflict', () => Effect.fail(new HttpApiError.Conflict())),
              Effect.catchTag('UserRepositoryError', () =>
                Effect.fail(new HttpApiError.ServiceUnavailable())
              )
            )
        )
      )
      .handle('updateUser', ({ params, payload }) =>
        Effect.flatMap(UserService, (service) =>
          service
            .update(parseUserId(params.id), {
              ...(payload.email !== undefined ? { email: payload.email } : {}),
              ...(payload.name !== undefined ? { name: payload.name } : {}),
              ...(payload.avatar_url !== undefined ? { avatar_url: payload.avatar_url } : {})
            })
            .pipe(
              Effect.flatMap((updated) =>
                updated === undefined
                  ? Effect.fail(new HttpApiError.NotFound())
                  : Effect.succeed(toUserResult(updated))
              ),
              Effect.catchTag('UserEmailConflict', () => Effect.fail(new HttpApiError.Conflict())),
              Effect.catchTag('UserRepositoryError', () =>
                Effect.fail(new HttpApiError.ServiceUnavailable())
              )
            )
        )
      )
      .handle('deleteUser', ({ params }) =>
        Effect.flatMap(UserService, (service) =>
          service.remove(parseUserId(params.id)).pipe(
            Effect.flatMap((deleted) =>
              deleted ? Effect.void : Effect.fail(new HttpApiError.NotFound())
            ),
            Effect.catchTag('UserRepositoryError', () =>
              Effect.fail(new HttpApiError.ServiceUnavailable())
            )
          )
        )
      )
  )
