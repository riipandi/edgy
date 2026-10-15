import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect, Exit, Layer } from 'effect'
import { ConfigLayer } from './kernel/config/service.ts'
import { AppLayer } from './layers.ts'

/** Builds the Node composition root over `env` and returns how it ended. */
const build = (env: Record<string, string>) =>
  Effect.exit(
    Effect.scoped(
      Layer.build(
        AppLayer.pipe(
          Layer.provide(
            ConfigLayer.pipe(
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromEnvRecord({
                    DATABASE_PATH: ':memory:',
                    LOG_LEVEL: 'None',
                    ...env
                  })
                )
              )
            )
          )
        )
      )
    )
  )

describe('AppLayer', () => {
  it.effect('builds on the in-process stores', () =>
    Effect.gen(function* () {
      expect(Exit.isSuccess(yield* build({}))).toBe(true)
      expect(
        Exit.isSuccess(yield* build({ RATE_LIMIT_ENABLED: 'false', CACHE_ENABLED: 'false' }))
      ).toBe(true)
    })
  )

  it.effect('refuses the Cloudflare stores outside the Workers runtime', () =>
    Effect.gen(function* () {
      const rate = yield* build({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_STORE: 'cloudflare' })
      expect(Exit.isFailure(rate) && String(rate.cause)).toContain('RATE_LIMIT_STORE=cloudflare')

      const cache = yield* build({ CACHE_ENABLED: 'true', CACHE_STORE: 'cloudflare' })
      expect(Exit.isFailure(cache) && String(cache.cause)).toContain('CACHE_STORE=cloudflare')
    })
  )

  it.effect('ignores a store that is switched off', () =>
    Effect.gen(function* () {
      const exit = yield* build({
        RATE_LIMIT_ENABLED: 'false',
        RATE_LIMIT_STORE: 'cloudflare',
        CACHE_ENABLED: 'false',
        CACHE_STORE: 'cloudflare'
      })
      expect(Exit.isSuccess(exit)).toBe(true)
    })
  )
})
