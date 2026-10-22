import { NodeFileSystem } from '@effect/platform-node'
import { Effect, Layer, Logger, References } from 'effect'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { AppConfig } from '#/kernel/config/config.ts'

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const loggers: Array<Logger.Logger<unknown, unknown>> = []
    if (config.logging.transport.includes('console')) {
      loggers.push(config.logging.format === 'json' ? Logger.consoleJson : Logger.consolePretty())
    }
    if (config.logging.transport.includes('file')) {
      mkdirSync(path.dirname(path.resolve(config.logging.file)), { recursive: true })
      const fileLogger = yield* Logger.toFile(config.logging.file, {
        batchWindow: config.logging.flushInterval
      })(Logger.formatSimple)
      loggers.push(fileLogger)
    }
    return Layer.merge(
      Layer.succeed(References.MinimumLogLevel, config.logging.level),
      Logger.layer(loggers)
    )
  })
).pipe(Layer.provide(NodeFileSystem.layer))
