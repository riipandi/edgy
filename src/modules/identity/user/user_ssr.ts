import { Effect } from 'effect'
import { AsyncLocalStorage } from 'node:async_hooks'
import { applicationRuntime } from '#/kernel/runtime.ts'
import { parseUserId, toUserResult, type UserIdType } from './user_schema.ts'
import { UserService } from './user_service.ts'

// Separate server bundles must resolve the same request context.
const requestServiceKey = Symbol.for('edgy.user-service-context')
const requestService =
  (Reflect.get(globalThis, requestServiceKey) as
    | AsyncLocalStorage<UserService['Service']>
    | undefined) ?? new AsyncLocalStorage<UserService['Service']>()
Reflect.set(globalThis, requestServiceKey, requestService)

export const withUserService = <A>(service: UserService['Service'], run: () => Promise<A>) =>
  requestService.run(service, run)

const runWithUserService = <A, E>(
  run: (service: UserService['Service']) => Effect.Effect<A, E>
) => {
  const service = requestService.getStore()
  return service === undefined
    ? applicationRuntime.runPromise(Effect.flatMap(UserService, run))
    : Effect.runPromise(run(service))
}

// The user page lists every user on one screen: no cursor UI exists there, so
// this reads a single page large enough to cover the seeded set.
export const listUsersFromService = () =>
  runWithUserService((service) =>
    Effect.map(service.list({ limit: 100, sortBy: 'id', sortOrder: 'asc' }), (result) =>
      result.users.map(toUserResult)
    )
  )

// The route boundary receives the raw route param; an unparseable id resolves
// to no user instead of crashing the render.
export const getUserFromService = (id: string) => {
  let userId: UserIdType
  try {
    userId = parseUserId(id)
  } catch {
    return Promise.resolve(undefined)
  }
  return runWithUserService((service) =>
    Effect.map(service.find(userId), (result) =>
      result.user === undefined ? undefined : toUserResult(result.user)
    )
  )
}
