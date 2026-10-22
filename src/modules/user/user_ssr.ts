import { getRequestEvent, httpHeader } from '@solidjs/web'
import { Data, Effect, Layer, ManagedRuntime } from 'effect'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ApplicationLayer, CoreLayer } from '#/kernel/layers.ts'
import { parseUserId, type UserIdType } from './user_schema.ts'
import { UserService } from './user_service.ts'

export class DisposeError extends Data.TaggedError('DisposeError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

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

/** Scoped-safe disposal for layer finalizers: rejection is logged, not a defect. */
export const disposeUserRuntimeEffect = Effect.tryPromise({
  try: () => runtime.dispose(),
  catch: (cause) => new DisposeError({ cause })
}).pipe(Effect.catch((error) => Effect.logError(`runtime disposal failed: ${error.message}`)))

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

// The cache status is read-scoped to the SSR request: the response head is
// committed when the shell flushes, so the header write must happen before
// the route's data promise resolves into markup. `?nocache=1` skips the
// cache for that request.
export const getUserFromService = (id: string) => {
  // The SSR boundary receives the raw route param; an unparseable id resolves
  // to no user instead of crashing the render.
  let userId: UserIdType
  try {
    userId = parseUserId(id)
  } catch {
    return Promise.resolve(undefined)
  }
  const event = getRequestEvent()
  const bypass =
    event !== undefined && new URL(event.request.url).searchParams.get('nocache') === '1'
  return runWithUserService((service) =>
    Effect.flatMap(service.find(userId, bypass), (result) =>
      Effect.sync(() => {
        httpHeader('x-cache', result.cache)
        return result.user
      })
    )
  )
}
