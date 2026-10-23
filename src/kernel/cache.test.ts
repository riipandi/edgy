import { it } from '@effect/vitest'
import { Effect, Layer, Schema, Tracer } from 'effect'
import { expect } from 'vite-plus/test'
import { testConfig } from '../../tests/fixtures/config.ts'
import { Cacheable } from './cache.ts'

const TestCache = Cacheable.Class<{ value: string; failure: string }>()('cache-test', {
  success: Schema.String,
  error: Schema.String,
  lookup: (key: string) => Effect.succeed(`value:${key}`)
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
