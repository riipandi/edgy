import { NodeRedis } from '@effect/platform-node'
import { Clock, Context, Data, Duration, Effect, Exit, Layer } from 'effect'
import { Option, Redacted, Schema, Scope } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { RateLimiter } from 'effect/persistence'
import { sql, type Kysely } from 'kysely'
import { Database } from '#/database/adapter.ts'
import type { DB } from '#/database/schema.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { redisUrlForDatabase } from '#/kernel/config/redis.ts'
import { awaitRedis } from '#/kernel/redis-boot.ts'
import { withDependencyTelemetry } from '#/observer/dependencies.ts'

export class RateLimitError extends Data.TaggedError('RateLimitError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

const verdictLabel = (allowed: boolean): 'allowed' | 'rejected' =>
  allowed ? 'allowed' : 'rejected'

export interface ConsumeVerdict {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  readonly resetSeconds: number
}

export class RateLimitCounter extends Context.Service<
  RateLimitCounter,
  {
    readonly consume: (
      key: string,
      max: number,
      window: Duration.Duration
    ) => Effect.Effect<ConsumeVerdict, RateLimitError>
  }
>()('RateLimitCounter') {}

// ---------------------------------------------------------------------------
// database backend: fixed-window counters in the rate_limits table
// ---------------------------------------------------------------------------

export const RateLimitSchema = Schema.Struct({
  key: Schema.String,
  window: Schema.String,
  count: Schema.Number
})

// Table interface for Kysely
export type IRateLimit = typeof RateLimitSchema.Type

declare module '#/database/schema.ts' {
  interface DB {
    rate_limits: IRateLimit
  }
}

const bumpWindow = (db: Kysely<DB>, key: string, bucket: string): Promise<number> =>
  db
    .insertInto('rate_limits')
    .values({ key, window: bucket, count: 1 })
    .onConflict((conflict) =>
      conflict.columns(['key', 'window']).doUpdateSet({ count: sql`rate_limits.count + 1` })
    )
    .returning('count')
    .executeTakeFirstOrThrow()
    .then((row) => row.count)

export const RateLimitCounterLayerDatabase = Layer.effect(
  RateLimitCounter,
  Effect.gen(function* () {
    const database = yield* Database
    // The sqlite traffic the counter makes is already timed at the adapter,
    // so this span carries the verdict only, without repeating the histogram.
    const verdictSpan = withDependencyTelemetry({
      store: 'sqlite',
      op: 'rate-limit-consume',
      span: 'rate-limit.consume',
      metric: false,
      outcome: (verdict: ConsumeVerdict) => ({
        'limiter.verdict': verdictLabel(verdict.allowed)
      }),
      onFailure: { 'limiter.verdict': 'unavailable' }
    })
    const consume = (key: string, max: number, window: Duration.Duration) =>
      Effect.gen(function* () {
        const windowMs = Duration.toMillis(window)
        const now = yield* Clock.currentTimeMillis
        const bucketStart = Math.floor(now / windowMs) * windowMs
        const bucket = String(bucketStart)
        const count = yield* database
          .query((db) => bumpWindow(db, key, bucket))
          .pipe(Effect.mapError((cause) => new RateLimitError({ cause })))
        if (count === 1)
          // A fresh window for this key: every older window is expired.
          yield* database
            .query((db) => db.deleteFrom('rate_limits').where('window', '<', bucket).execute())
            .pipe(Effect.ignore)
        return {
          allowed: count <= max,
          limit: max,
          remaining: Math.max(0, max - count),
          resetSeconds: Math.max(1, Math.ceil((bucketStart + windowMs - now) / 1000))
        } satisfies ConsumeVerdict
      }).pipe(verdictSpan)
    return RateLimitCounter.of({ consume })
  })
)

// ---------------------------------------------------------------------------
// redis backend: fixed-window counters shared by every instance
// ---------------------------------------------------------------------------

export const RateLimitCounterLayerRedis = (url: Redacted.Redacted) =>
  Layer.orDie(
    Layer.effect(
      RateLimitCounter,
      Effect.gen(function* () {
        // The client's finalizer sits inside this scope, so closing it here is
        // the only place the close can be logged on both sides.
        const redisScope = yield* Scope.make()
        const context = yield* awaitRedis(
          Layer.build(
            RateLimiter.layer.pipe(
              Layer.provide(RateLimiter.layerStoreRedis({ prefix: 'rate-limit:' })),
              Layer.provide(NodeRedis.layer({ url: Redacted.value(url) }))
            )
          )
        ).pipe(Effect.provideService(Scope.Scope, redisScope), Effect.orDie)
        yield* Effect.addFinalizer(() =>
          Effect.logInfo('Closing redis rate-limit connection').pipe(
            Effect.andThen(Scope.close(redisScope, Exit.void)),
            Effect.andThen(Effect.logInfo('Redis rate-limit connection closed'))
          )
        )
        const limiter = yield* RateLimiter.RateLimiter.pipe(Effect.provide(context))
        const redisSpan = withDependencyTelemetry({
          store: 'redis',
          op: 'rate-limit-consume',
          span: 'rate-limit.redis-consume',
          outcome: (verdict: ConsumeVerdict) => ({
            'limiter.verdict': verdictLabel(verdict.allowed)
          }),
          onFailure: { 'limiter.verdict': 'unavailable' }
        })
        const consume = (key: string, max: number, window: Duration.Duration) =>
          limiter
            .consume({ key, limit: max, window, onExceeded: 'fail', algorithm: 'fixed-window' })
            .pipe(
              Effect.map((result) => ({
                allowed: true,
                limit: result.limit,
                remaining: result.remaining,
                resetSeconds: Math.max(1, Math.ceil(Duration.toMillis(result.resetAfter) / 1000))
              })),
              Effect.catch((error: RateLimiter.RateLimiterError) =>
                error.reason._tag === 'RateLimitExceeded'
                  ? Effect.succeed({
                      allowed: false,
                      limit: error.reason.limit,
                      remaining: 0,
                      resetSeconds: Math.max(
                        1,
                        Math.ceil(Duration.toMillis(error.reason.retryAfter) / 1000)
                      )
                    } satisfies ConsumeVerdict)
                  : Effect.fail(new RateLimitError({ cause: error.reason }))
              ),
              redisSpan
            )
        return RateLimitCounter.of({ consume })
      })
    )
  )
// ---------------------------------------------------------------------------
// store selection and the route middleware
// ---------------------------------------------------------------------------

export const RateLimitCounterLayer: Layer.Layer<RateLimitCounter, never, AppConfig | Database> =
  Layer.unwrap(
    Effect.map(AppConfig, (config): Layer.Layer<RateLimitCounter, never, AppConfig | Database> =>
      config.redis.enabled
        ? RateLimitCounterLayerRedis(
            Redacted.make(redisUrlForDatabase(config.redis.url, 'rateLimit'))
          )
        : RateLimitCounterLayerDatabase
    )
  )

// Standard rate limit headers (draft IETF: RateLimit-*). Route-scoped: only
// the route layers this is provided to are limited, so pages and static
// assets stay unlimited. A store failure answers 503 instead of letting the
// request through unthrottled. `excludePaths` opts routes out entirely —
// a readiness probe must never consume the budget or trip the limit. An
// exclusion with `exact: true` matches the pathname alone; otherwise it is
// a prefix, so `/api/users` also covers `/api/users/:id`.
export interface RateLimitExclusion {
  readonly path: string
  readonly exact?: boolean
}

// A configured path loses its trailing slashes so `exact` matches the same
// pathname whether it was written with one or not.
const normalizePath = (path: string): string => path.replace(/\/+$/u, '') || '/'

const excludedPath = (pathname: string, exclusion: RateLimitExclusion): boolean => {
  const path = normalizePath(exclusion.path)
  return exclusion.exact === true ? pathname === path : pathname.startsWith(path)
}

export const rateLimitMiddleware = (options?: {
  readonly excludePaths?: ReadonlyArray<RateLimitExclusion>
}) => {
  const exclusions = options?.excludePaths ?? []
  return Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* AppConfig
      const counter = yield* RateLimitCounter
      if (!config.security.rateLimitEnabled) return Layer.empty
      const { rateLimitMax, rateLimitWindow } = config.security
      return HttpRouter.middleware((httpEffect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const { pathname } = new URL(request.url, config.app.baseUrl)
          if (exclusions.some((exclusion) => excludedPath(pathname, exclusion)))
            return yield* httpEffect
          const key = Option.getOrUndefined(request.remoteAddress) ?? 'local'
          const verdict = yield* counter
            .consume(key, rateLimitMax, rateLimitWindow)
            .pipe(Effect.catchTag('RateLimitError', () => Effect.succeed('unavailable' as const)))
          if (verdict === 'unavailable')
            return HttpServerResponse.setStatus(503)(HttpServerResponse.text('Service Unavailable'))
          const headers = {
            'ratelimit-limit': String(verdict.limit),
            'ratelimit-reset': String(verdict.resetSeconds),
            'ratelimit-remaining': String(verdict.remaining)
          }
          if (!verdict.allowed) {
            return HttpServerResponse.setStatus(429)(
              HttpServerResponse.text('Too Many Requests')
            ).pipe(
              HttpServerResponse.setHeaders({
                ...headers,
                'retry-after': String(verdict.resetSeconds)
              })
            )
          }
          const response = yield* httpEffect
          return HttpServerResponse.setHeaders(headers)(response)
        })
      ).layer
    })
  ).pipe(Layer.provide(RateLimitCounterLayer))
}
