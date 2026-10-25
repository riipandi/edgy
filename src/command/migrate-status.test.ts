import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { databaseEnv, runCli, tempDirectory } from './cli.ts'

it.effect('reports an unmigrated schema', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['migrate:status'], databaseEnv(directory))

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output).toEqual([
      'Executed (0):',
      '(none)',
      'Pending (4):',
      '00001_create_platform_tables',
      '00002_create_identity_table',
      '00003_create_token_tables',
      '00004_rate_limits_table'
    ])
  })
)

it.effect('groups the executed and pending migrations', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    const target = MIGRATION_NAMES[1] as string
    yield* runCli(['migrate:up', '--to', target], env)

    const result = yield* runCli(['migrate:status'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output[0]).toBe('Executed (2):')
    for (const applied of MIGRATION_NAMES.slice(0, 2))
      expect(result.output.some((line) => line.startsWith(`${applied} 2`))).toBe(true)
    expect(result.output).toContain('Pending (2):')
    expect(result.output).toContain(MIGRATION_NAMES[2])
    expect(result.output).toContain(MIGRATION_NAMES[3])
  })
)

it.effect('reports a fully applied schema with no pending', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:status'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output[0]).toBe('Executed (4):')
    expect(result.output).toContain('Pending (0):')
    expect(result.output).toContain('(none)')
  })
)
