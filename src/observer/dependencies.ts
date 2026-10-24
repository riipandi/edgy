import { Effect, Exit, Metric, Option, Tracer } from 'effect'

export type DependencyStore = 'sqlite' | 'redis'

export type DependencyOp =
  | 'query'
  | 'read'
  | 'ping'
  | 'cache-get'
  | 'cache-invalidate'
  | 'rate-limit-consume'

// Attributes are bounded: the store and op label the series, and every span
// carries only the fixed attribute set — a cache status or a limiter verdict,
// never a cache key or a query string.
const DEPENDENCY_BOUNDARIES = [
  0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 5
]

export const dependencyDuration = Metric.histogram('dependency_duration_seconds', {
  description: 'Dependency call duration (database, cache, rate-limit store) in seconds',
  boundaries: DEPENDENCY_BOUNDARIES
})

const record = (store: DependencyStore, op: DependencyOp, durationMs: number) =>
  Metric.update(
    Metric.withAttributes(dependencyDuration, { store, op }),
    Math.max(0, durationMs) / 1000
  )

// Annotates the span the effect runs inside, when one exists: attributes set
// after a call completes cannot enter `withSpan` options statically.
export const annotateSpan = (attributes: Readonly<Record<string, string | undefined>>) =>
  Effect.serviceOption(Tracer.ParentSpan).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (anySpan) =>
          anySpan._tag === 'Span'
            ? Effect.sync(() => {
                for (const [key, value] of Object.entries(attributes)) {
                  if (value !== undefined) anySpan.attribute(key, value)
                }
              })
            : Effect.void
      })
    )
  )

interface DependencyTelemetry {
  readonly store: DependencyStore
  readonly op: DependencyOp
  readonly span: string
  readonly attributes?: Readonly<Record<string, string>>
  // false when the call's own store traffic is already counted one layer down
  // (the database limiter counts its counter query through the adapter).
  readonly metric?: boolean
  readonly outcome?: (value: never) => Readonly<Record<string, string | undefined>>
  readonly onFailure?: Readonly<Record<string, string | undefined>>
}

// Wraps a dependency call in a span and times it for the histogram, success
// or failure; the outcome attributes annotate the span once the value exists.
export const withDependencyTelemetry =
  ({ metric = true, attributes, outcome, onFailure, ...config }: DependencyTelemetry) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      const started = Date.now()
      // The exit handler stays inside the span: the annotation must land
      // before `withSpan` closes it, so the outcome survives into the trace.
      return effect.pipe(
        Effect.onExit((exit) => {
          const annotate = Exit.isSuccess(exit)
            ? outcome === undefined
              ? Effect.void
              : annotateSpan(outcome(exit.value as never))
            : onFailure === undefined
              ? Effect.void
              : annotateSpan(onFailure)
          return Effect.asVoid(
            Effect.andThen(
              annotate,
              metric ? record(config.store, config.op, Date.now() - started) : Effect.void
            )
          )
        }),
        Effect.withSpan(config.span, {
          attributes: { store: config.store, op: config.op, ...attributes }
        })
      )
    })
