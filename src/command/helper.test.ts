import { NodeServices, NodeTerminal } from '@effect/platform-node'
import { Effect, Exit, Layer } from 'effect'
import { TerminalCapabilities } from 'effect/cli'
import { TestConsole } from 'effect/testing'
import { expect, it } from 'vite-plus/test'
import { confirmDestructive, reporter } from './helper.ts'

const captured = (colors: boolean) =>
  Effect.gen(function* () {
    const report = yield* reporter
    yield* report.start('Applying 1 migration(s)')
    yield* report.ok('Applied 00001_x')
    yield* report.warn('Would apply 00002_y')
    yield* report.space()
    return yield* TestConsole.logLines
  }).pipe(
    Effect.provide(
      Layer.succeed(TerminalCapabilities.TerminalCapabilities, {
        canColor: colors,
        canAnimate: false,
        canPrompt: false
      })
    ),
    Effect.provide(TestConsole.layer)
  )

const runConfirmed = (force: boolean) =>
  Effect.gen(function* () {
    return yield* confirmDestructive(force, 'Roll back?', 'non-interactive session: pass --force')
  }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, NodeTerminal.layer)))

it('colors the report when the terminal can color', async () => {
  expect(await Effect.runPromise(captured(true))).toEqual([
    '\u001b[36mApplying 1 migration(s)\u001b[0m',
    '\u001b[32mApplied 00001_x\u001b[0m',
    '\u001b[33mWould apply 00002_y\u001b[0m',
    ''
  ])
})

it('stays plain without color support', async () => {
  expect(await Effect.runPromise(captured(false))).toEqual([
    'Applying 1 migration(s)',
    'Applied 00001_x',
    'Would apply 00002_y',
    ''
  ])
})

it('skips the prompt with --force', async () => {
  const confirmed = await Effect.runPromise(runConfirmed(true))
  expect(confirmed).toBe(true)
})

it('refuses a destructive step without a TTY', async () => {
  const exit = await Effect.runPromiseExit(runConfirmed(false))
  expect(Exit.isFailure(exit)).toBe(true)
})
