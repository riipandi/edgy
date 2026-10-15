import { Array as Arr, ConfigProvider, Effect, Layer } from 'effect'
import { Persistence } from 'effect/persistence'
import { LocalCachePersistence } from '../src/kernel/cache/local.ts'
import { ConfigLayer } from '../src/kernel/config/service.ts'

/** Recorded calls and contents of a fake shared store. */
export interface FakeStore {
  readonly entries: Map<string, object>
  readonly calls: { get: number; set: number; remove: number }
}

/**
 * A backing store in a `Map`, standing in for Redis. Layers that share one `FakeStore` act as
 * separate processes on one store. `failWith` makes every call fail, or hang for `'hang'`.
 */
export const fakeBacking = (
  store: FakeStore,
  failWith?: 'fail' | 'hang'
): Layer.Layer<Persistence.BackingPersistence> => {
  // Counts the attempt before it can fail, so a test sees whether the store was asked at all.
  const outage = <A>(
    kind: keyof FakeStore['calls'],
    run: () => A
  ): Effect.Effect<A, Persistence.PersistenceError> =>
    Effect.suspend(() => {
      store.calls[kind] += 1
      return failWith === 'hang'
        ? Effect.never
        : failWith === 'fail'
          ? Effect.fail(new Persistence.PersistenceError({ message: 'store is down' }))
          : Effect.sync(run)
    })

  return Layer.succeed(Persistence.BackingPersistence)(
    Persistence.BackingPersistence.of({
      make: (storeId) =>
        Effect.succeed({
          get: (key) => outage('get', () => store.entries.get(`${storeId}:${key}`)),
          getMany: (keys) =>
            outage('get', () => Arr.map(keys, (key) => store.entries.get(`${storeId}:${key}`))),
          set: (key, value) =>
            outage('set', () => {
              store.entries.set(`${storeId}:${key}`, value)
            }),
          setMany: () => Effect.void,
          remove: (key) =>
            outage('remove', () => {
              store.entries.delete(`${storeId}:${key}`)
            }),
          clear: Effect.void
        })
    })
  )
}

export const makeFakeStore = (): FakeStore => ({
  entries: new Map(),
  calls: { get: 0, set: 0, remove: 0 }
})

/** Configuration from `env`, plus a `Persistence` that is in-process unless `backing` is given. */
export const cacheEnvironment = (
  env: Readonly<Record<string, string>> = {},
  backing?: Layer.Layer<Persistence.BackingPersistence>
) =>
  Layer.mergeAll(
    ConfigLayer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)))),
    backing === undefined ? LocalCachePersistence : Persistence.layer.pipe(Layer.provide(backing))
  )
