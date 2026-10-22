import { it } from '@effect/vitest'
import { ConfigProvider, Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { choiceList } from './field.ts'

it.effect('rejects empty entries in comma-separated configuration values', () =>
  Effect.gen(function* () {
    const config = choiceList('TEST_SINKS', ['console', 'file'], ['console'], 'Test sinks').config
    const exit = yield* Effect.exit(
      config.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnvRecord({ TEST_SINKS: 'console,,file' }))
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })
)
