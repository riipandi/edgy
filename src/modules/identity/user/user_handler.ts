import { Effect } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import type { api } from '#/kernel/http/api.ts'
import {
  ApiConflictError,
  ApiNotFoundError,
  ApiServiceUnavailableError,
  ApiValidationError
} from '#/kernel/http/errors.ts'
import { decodeCursor, encodeCursor } from '#/kernel/http/pagination.ts'
import { respondError, respondSuccess } from '#/kernel/http/respond.ts'
import type { ListCursor } from './user_repo.ts'
import { parseUserId, toUserResult } from './user_schema.ts'
import { UserService } from './user_service.ts'

// `?nocache=1` skips the cache for that request: no read, no fill. A
// debugging affordance; production clients always read through the cache.
const nocacheRequested = (request: HttpServerRequest.HttpServerRequest, config: AppConfigShape) =>
  config.app.nodeEnv !== 'production' &&
  new URL(request.url, config.app.baseUrl).searchParams.get('nocache') === '1'

const userNotFound = () =>
  respondError(
    new ApiNotFoundError({ code: 'USER_NOT_FOUND', retryable: false }),
    404,
    'User not found'
  )

const emailConflict = (error: { readonly email: string }) =>
  respondError(
    new ApiConflictError({
      code: 'EMAIL_CONFLICT',
      retryable: false,
      details: { email: error.email }
    }),
    409,
    'A user with this email already exists'
  )

const databaseUnavailable = () =>
  respondError(
    new ApiServiceUnavailableError({ code: 'DATABASE_ERROR', retryable: true }),
    503,
    'The database is temporarily unavailable'
  )

// A factory, not a module-scope layer: building the group layer eagerly would
// make the `api` value import a runtime cycle (api.ts -> module -> here).
export const usersHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'users', (handlers) =>
    handlers
      .handle('listUsers', ({ query }) =>
        Effect.gen(function* () {
          const service = yield* UserService
          const limit = query.limit ?? 20
          const sortBy = query.sort_by ?? 'id'
          const sortOrder = query.sort_order ?? 'asc'
          let cursor: ListCursor | undefined
          if (query.cursor !== undefined) {
            const decoded = decodeCursor<ListCursor>(query.cursor)
            if (decoded === undefined)
              return yield* respondError(
                new ApiValidationError({ code: 'INVALID_CURSOR', retryable: false }),
                400,
                'The cursor is invalid or expired'
              )
            cursor = decoded
          }
          const result = yield* service
            .list({ limit, sortBy, sortOrder, ...(cursor !== undefined ? { cursor } : {}) })
            .pipe(Effect.catchTag('UserRepositoryError', databaseUnavailable))
          const last = result.users.at(-1)
          const nextCursor =
            result.hasMore && last !== undefined
              ? encodeCursor({ sortValue: String(last[sortBy]), id: last.id })
              : null
          return yield* respondSuccess(result.users.map(toUserResult), {
            pagination: { limit, hasMore: result.hasMore, nextCursor }
          })
        })
      )
      .handle('getUser', ({ params }) =>
        Effect.flatMap(AppConfig, (config) =>
          Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
            Effect.flatMap(UserService, (service) =>
              service.find(parseUserId(params.id), nocacheRequested(request, config)).pipe(
                Effect.flatMap((result) =>
                  result.user === undefined
                    ? userNotFound()
                    : respondSuccess(toUserResult(result.user), { cache: result.cache })
                ),
                Effect.catchTag('UserRepositoryError', databaseUnavailable)
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
              Effect.flatMap((user) => respondSuccess(toUserResult(user), { statusCode: 201 })),
              Effect.catchTag('UserEmailConflict', emailConflict),
              Effect.catchTag('UserRepositoryError', databaseUnavailable)
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
                updated === undefined ? userNotFound() : respondSuccess(toUserResult(updated))
              ),
              Effect.catchTag('UserEmailConflict', emailConflict),
              Effect.catchTag('UserRepositoryError', databaseUnavailable)
            )
        )
      )
      .handle('deleteUser', ({ params }) =>
        Effect.flatMap(UserService, (service) =>
          service.remove(parseUserId(params.id)).pipe(
            Effect.flatMap((deleted) => (deleted ? respondSuccess(undefined) : userNotFound())),
            Effect.catchTag('UserRepositoryError', databaseUnavailable)
          )
        )
      )
  )
