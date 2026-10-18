import { Config, Context, Effect, Layer } from 'effect'
import type { LogLevel } from 'effect/LogLevel'

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly host: string
    readonly port: number
    readonly databasePath: string
    readonly logLevel: LogLevel
    readonly otelDisabled: boolean
    readonly rateLimitMax: number
  }
>()('app/Config') {}

const load = Effect.gen(function* () {
  const host = yield* Config.String('HOST').pipe(Config.withDefault('0.0.0.0'))
  const port = yield* Config.Port('PORT').pipe(Config.withDefault(3000))
  const databasePath = yield* Config.String('DATABASE_PATH').pipe(
    Config.withDefault('storage/data/app.db')
  )
  const logLevel = yield* Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info'))
  const otelDisabled = yield* Config.Boolean('OTEL_SDK_DISABLED').pipe(Config.withDefault(false))
  const rateLimitMax = yield* Config.Int('RATE_LIMIT_MAX').pipe(Config.withDefault(1000))
  return { host, port, databasePath, logLevel, otelDisabled, rateLimitMax }
})

export const layer = Layer.effect(AppConfig, load)
