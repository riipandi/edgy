import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { normalizeArgs, subcommandOf } from './cli.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './harness.ts'

it('normalizes the --log-level value in both flag forms', () => {
  expect(normalizeArgs(['--log-level', 'Debug', 'serve'])).toEqual([
    '--log-level',
    'debug',
    'serve'
  ])
  expect(normalizeArgs(['--log-level=WARN', 'serve'])).toEqual(['--log-level=warn', 'serve'])
  expect(normalizeArgs(['serve', '--auto-migrate'])).toEqual(['serve', '--auto-migrate'])
})

it('reads the subcommand from the first positional token', () => {
  expect(subcommandOf(['serve'])).toBe('serve')
  expect(subcommandOf(['--log-level', 'info', 'serve'])).toBe('serve')
  expect(subcommandOf(['--log-level=info', 'serve', '--auto-migrate'])).toBe('serve')
  expect(subcommandOf(['--help'])).toBeUndefined()
  expect(subcommandOf([])).toBeUndefined()
  // A flag value is not a subcommand, however it is spelled.
  expect(subcommandOf(['--log-level', 'serve'])).toBeUndefined()
})

it.effect('--log-level suppresses the logs below it', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)

    const quiet = yield* runCli(['--log-level', 'error', 'migrate:status'], env)
    expect(Exit.isSuccess(quiet.exit)).toBe(true)
    expect(quiet.logs).toEqual([])

    const loud = yield* runCli(['migrate:status'], env)
    expect(Exit.isSuccess(loud.exit)).toBe(true)
    expect(loud.logs).toContain('00001_create_platform_tables pending')
  })
)

it.effect('--log-level accepts the level capitalized, like LOG_LEVEL does', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)

    const capitalized = yield* runCli(['--log-level', 'Debug', 'migrate:status'], env)
    const lowercase = yield* runCli(['--log-level', 'debug', 'migrate:status'], env)

    expect(Exit.isSuccess(capitalized.exit)).toBe(true)
    expect(capitalized.logs).toEqual(lowercase.logs)
  })
)

it.effect('--log-level rejects a value it does not know', () =>
  Effect.gen(function* () {
    const result = yield* runCli(['--log-level', 'bogus', 'migrate:status'], {})
    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain('InvalidValue')
  })
)

it.effect('--help lists the global flags the document names', () =>
  Effect.gen(function* () {
    const result = yield* runCli(['--help'])
    const help = result.output.join('\n')

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(help).toContain('--help, -h')
    expect(help).toContain('--version, -v')
    expect(help).toContain('--log-level <level>')
  })
)

it.effect('--version prints the package version', () =>
  Effect.gen(function* () {
    const result = yield* runCli(['--version'])
    expect(result.output.join('\n')).toContain('edgy v0.0.0')
  })
)

it.effect('the undocumented flags are gone', () =>
  Effect.gen(function* () {
    const wizard = yield* runCli(['--wizard'])
    const completions = yield* runCli(['--completions', 'bash'])

    expect(Exit.isFailure(wizard.exit)).toBe(true)
    expect(failureOf(wizard)).toContain('--wizard')
    expect(Exit.isFailure(completions.exit)).toBe(true)
    expect(failureOf(completions)).toContain('--completions')
  })
)
