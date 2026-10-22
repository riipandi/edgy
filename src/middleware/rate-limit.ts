import { NodeRedis } from '@effect/platform-node'
import { Clock, Context, Data, Duration, Effect, Layer, Option, Redacted, Schema } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { RateLimiter } from 'effect/persistence'
import { sql, type Kysely } from 'kysely'
import { Database } from '#/database/adapter.ts'
import type { DB } from '#/database/schema.ts'
import { AppConfig } from '#/kernel/config/config.ts'

export class RateLimitError extends Data.TaggedError('RateLimitError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

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
      })
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
        const limiter = yield* RateLimiter.RateLimiter
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
              )
            )
        return RateLimitCounter.of({ consume })
      })
    ).pipe(
      Layer.provide(RateLimiter.layer),
      Layer.provide(RateLimiter.layerStoreRedis({ prefix: 'rate-limit:' })),
      Layer.provide(NodeRedis.layer({ url: Redacted.value(url) }))
    )
  )

// ---------------------------------------------------------------------------
// store selection and the route middleware
// ---------------------------------------------------------------------------

export const RateLimitCounterLayer: Layer.Layer<RateLimitCounter, never, AppConfig | Database> =
  Layer.unwrap(
    Effect.map(AppConfig, (config): Layer.Layer<RateLimitCounter, never, AppConfig | Database> =>
      config.security.rateLimitStore === 'redis'
        ? RateLimitCounterLayerRedis(config.security.rateLimitRedisUrl)
        : RateLimitCounterLayerDatabase
    )
  )

// Standard rate limit headers (draft IETF: RateLimit-*). Route-scoped: only
// the route layers this is provided to are limited, so pages and static
// assets stay unlimited. A store failure fails the request instead of
// silently letting it through.
export const rateLimit = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const counter = yield* RateLimitCounter
    if (!config.security.rateLimitEnabled) return Layer.empty
    const { rateLimitMax, rateLimitWindow } = config.security
    return HttpRouter.middleware((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const key = Option.getOrUndefined(request.remoteAddress) ?? 'local'
        const verdict = yield* counter.consume(key, rateLimitMax, rateLimitWindow)
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
