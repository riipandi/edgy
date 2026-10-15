import { Array as Arr, Effect, Layer } from 'effect'
import { Persistence } from 'effect/persistence'

/**
 * A backing store that keeps nothing. With it `PersistedCache` is only its in-process half:
 * the `memory` store, with no second copy of every entry and no serialisation (a read-through
 * for it sets the persisted TTL to zero, which skips the write).
 */
const nothing: Persistence.BackingPersistenceStore = {
  get: () => Effect.undefined,
  getMany: (keys) => Effect.succeed(Arr.map(keys, () => undefined)),
  set: () => Effect.void,
  setMany: () => Effect.void,
  remove: () => Effect.void,
  clear: Effect.void
}

/** `Persistence` for the `memory` store (and for a disabled cache, which never reads it). */
export const LocalCachePersistence: Layer.Layer<Persistence.Persistence> = Persistence.layer.pipe(
  Layer.provide(
    Layer.succeed(Persistence.BackingPersistence)(
      Persistence.BackingPersistence.of({ make: () => Effect.succeed(nothing) })
    )
  )
)
