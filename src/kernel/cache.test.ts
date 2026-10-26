import { it } from '@effect/vitest'
import { Effect, Layer, Schema, Tracer } from 'effect'
import { expect } from 'vite-plus/test'
import { config, testConfig } from '../../tests/fixtures/config.ts'
import { Cacheable } from './cache.ts'
import { AppConfig } from './config/config.ts'

const TestCache = Cacheable.Class<{ value: string; failure: string }>()('cache-test', {
  success: Schema.String,
  error: Schema.String,
  lookup: (key: string) => Effect.succeed(`value:${key}`)
})

const DisabledCache = Cacheable.Class<{ value: string; failure: string }>()('cache-disabled', {
  success: Schema.String,
  error: Schema.String,
  lookup: (key: string) => Effect.succeed(`direct:${key}`)
})

const FlakyLookupCache = Cacheable.Class<{ value: string; failure: string }>()('cache-flaky', {
  success: Schema.String,
  error: Schema.String,
  lookup: (key: string) =>
    Effect.suspend(() => {
      attempts[key] = (attempts[key] ?? 0) + 1
      return key === 'boom'
        ? Effect.fail(`lookup failed for ${key}`)
        : Effect.succeed(`value:${key}`)
    })
})

const attempts: Record<string, number> = {}

const disabledConfig = Layer.succeed(AppConfig, {
  ...config,
  cache: { ...config.cache, enabled: false }
})

const recorded: Array<Tracer.NativeSpan> = []
const recorder = Layer.succeed(
  Tracer.Tracer,
  Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      recorded.push(span)
      return span
    }
  })
)

const cacheLayer = Layer.provideMerge(TestCache.layer.pipe(Layer.provide(testConfig)), recorder)

it.effect('annotates the cache status on the get and bypass spans', () =>
  Effect.gen(function* () {
    const cache = yield* TestCache
    const first = yield* cache.get('a')
    expect(first[1]).toBe('miss')
    const second = yield* cache.get('a')
    expect(second[1]).toBe('hit')
    const bypassed = yield* cache.bypass('a')
    expect(bypassed[1]).toBe('bypass')

    const gets = recorded.filter((span) => span.name === 'cache.get')
    expect(gets).toHaveLength(2)
    expect(gets.map((span) => span.attributes.get('cache.status'))).toEqual(['miss', 'hit'])

    const bypasses = recorded.filter((span) => span.name === 'cache.bypass')
    expect(bypasses).toHaveLength(1)
    expect(bypasses[0]?.attributes.get('cache.status')).toBe('bypass')
  }).pipe(Effect.provide(cacheLayer))
)

it.effect('serves every lookup directly when the cache is disabled', () =>
  Effect.gen(function* () {
    const cache = yield* DisabledCache
    expect(yield* cache.get('a')).toEqual(['direct:a', 'disabled'])
    expect(yield* cache.bypass('a')).toEqual(['direct:a', 'disabled'])
    yield* cache.invalidate('a')
  }).pipe(Effect.provide(DisabledCache.layer.pipe(Layer.provide(disabledConfig))))
)

it.effect('drops a failed lookup so the next request retries it', () =>
  Effect.gen(function* () {
    const cache = yield* FlakyLookupCache

    const failure = yield* Effect.flip(cache.get('boom'))
    expect(failure).toBe('lookup failed for boom')
    expect(attempts['boom']).toBe(1)

    // The failed entry must not stay pinned until the TTL expires.
    const again = yield* Effect.flip(cache.get('boom'))
    expect(again).toBe('lookup failed for boom')
    expect(attempts['boom']).toBe(2)

    const fine = yield* cache.get('ok')
    expect(fine).toEqual(['value:ok', 'miss'])
  }).pipe(Effect.provide(FlakyLookupCache.layer.pipe(Layer.provide(testConfig))))
)

it.effect('invalidation forces the next get back to a miss', () =>
  Effect.gen(function* () {
    const cache = yield* TestCache
    yield* cache.get('fresh')
    expect((yield* cache.get('fresh'))[1]).toBe('hit')

    yield* cache.invalidate('fresh')
    expect((yield* cache.get('fresh'))[1]).toBe('miss')
  }).pipe(Effect.provide(cacheLayer))
)
