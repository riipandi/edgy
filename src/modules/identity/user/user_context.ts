import { Effect } from 'effect'
import { AsyncLocalStorage } from 'node:async_hooks'
import { applicationRuntime } from '#/kernel/runtime.ts'
import { UserService } from './user_service.ts'

// The page bundle and the app bundle each inline this module; the shared
// symbol keeps them on one request context.
const requestServiceKey = Symbol.for('edgy.user-service-context')
const requestService =
  (Reflect.get(globalThis, requestServiceKey) as
    | AsyncLocalStorage<UserService['Service']>
    | undefined) ?? new AsyncLocalStorage<UserService['Service']>()
Reflect.set(globalThis, requestServiceKey, requestService)

export const withUserService = <A>(service: UserService['Service'], run: () => Promise<A>) =>
  requestService.run(service, run)

export const runWithUserService = <A, E>(
  run: (service: UserService['Service']) => Effect.Effect<A, E>
) => {
  const service = requestService.getStore()
  return service === undefined
    ? applicationRuntime.runPromise(Effect.flatMap(UserService, run))
    : Effect.runPromise(run(service))
}
