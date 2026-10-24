import { NodeServices } from '@effect/platform-node'
import { Cause, ConfigProvider, Effect, Exit, Layer, Logger, Option } from 'effect'
import { TestConsole } from 'effect/testing'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigLayer } from '#/kernel/config/config.ts'
import { run } from './cli.ts'

/** What a command run produced: its exit, its log lines, and its console output. */
export interface CliResult {
  readonly exit: Exit.Exit<void, unknown>
  readonly logs: ReadonlyArray<string>
  readonly output: ReadonlyArray<string>
}

/**
 * Runs the real CLI program with the given argv, a real filesystem, and the
 * configuration drawn from `env` alone — no `.env.local`, no ambient variables.
 * Logs and console output are captured instead of printed.
 */
export const runCli = (
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>> = {}
): Effect.Effect<CliResult> => {
  const logs: Array<string> = []
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(run(args))
    const output = yield* TestConsole.logLines
    return { exit, logs, output: output.map(String) }
  }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, ConfigLayer, TestConsole.layer)),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
    Effect.provide(Logger.layer([Logger.make(({ message }) => void logs.push(String(message)))])),
    Effect.scoped,
    Effect.orDie
  )
}

/** The failure the run ended with, rendered for an assertion. */
export const failureOf = (result: CliResult): string => {
  if (Exit.isSuccess(result.exit)) return ''
  const error = Cause.findErrorOption(result.exit.cause)
  if (Option.isNone(error)) return String(result.exit.cause)
  const value = error.value as {
    readonly _tag?: string
    readonly userMessage?: string
    readonly cause?: unknown
  }
  if (value._tag === 'UserError') return value.userMessage ?? String(value.cause)
  const errors = (value as { readonly errors?: ReadonlyArray<unknown> }).errors
  return errors === undefined ? String(value) : JSON.stringify(errors)
}

/** A fresh directory under the system temp directory, removed when the scope closes. */
export const tempDirectory = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), 'edgy-cli-'))),
  (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
)

/** Configuration pointing the database at a file inside the given temp directory. */
export const databaseEnv = (directory: string): Record<string, string> => ({
  DATABASE_PATH: join(directory, 'edgy.db')
})
