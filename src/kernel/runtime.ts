import { Data, Effect, Layer, ManagedRuntime } from 'effect'
import { ApplicationLayer, CoreLayer } from './layers.ts'

export class DisposeError extends Data.TaggedError('DisposeError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

const runtime = ManagedRuntime.make(ApplicationLayer.pipe(Layer.provideMerge(CoreLayer)))

// The kernel owns the application runtime; modules and compositions receive
// the context or the runner, never the construction.
export const applicationRuntime = runtime
export const applicationContext = () => runtime.context()
export const disposeUserRuntime = () => runtime.dispose()

/** Scoped-safe disposal for layer finalizers: rejection is logged, not a defect. */
export const disposeUserRuntimeEffect = Effect.tryPromise({
  try: () => runtime.dispose(),
  catch: (cause) => new DisposeError({ cause })
}).pipe(Effect.catch((error) => Effect.logError(`Runtime disposal failed: ${error.message}`)))
