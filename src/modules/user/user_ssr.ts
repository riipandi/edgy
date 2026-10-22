import { Effect, Layer, ManagedRuntime } from 'effect'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ApplicationLayer, CoreLayer } from '#/kernel/layers.ts'
import { UserService } from './user_service.ts'

// Separate server bundles must resolve the same request context.
const requestServiceKey = Symbol.for('edgy.user-service-context')
const requestService =
  (Reflect.get(globalThis, requestServiceKey) as
    | AsyncLocalStorage<UserService['Service']>
    | undefined) ?? new AsyncLocalStorage<UserService['Service']>()
Reflect.set(globalThis, requestServiceKey, requestService)
const runtime = ManagedRuntime.make(ApplicationLayer.pipe(Layer.provideMerge(CoreLayer)))

export const applicationContext = () => runtime.context()
export const disposeUserRuntime = () => runtime.dispose()

export const withUserService = <A>(service: UserService['Service'], run: () => Promise<A>) =>
  requestService.run(service, run)

const runWithUserService = <A, E>(
  run: (service: UserService['Service']) => Effect.Effect<A, E>
) => {
  const service = requestService.getStore()
  return service === undefined
    ? runtime.runPromise(Effect.flatMap(UserService, run))
    : Effect.runPromise(run(service))
}

export const listUsersFromService = () => runWithUserService((service) => service.list())

export const getUserFromService = (id: string) => runWithUserService((service) => service.find(id))
