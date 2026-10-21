import { Effect, Layer } from 'effect'
import * as References from 'effect/References'
import { AppConfig } from '#/kernel/config/app-config.ts'

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    return Layer.succeed(References.MinimumLogLevel, config.logLevel)
  })
)
