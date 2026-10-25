import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { USER_SEED_COUNT } from '#/database/seeders/user_factory.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './cli.ts'

it.effect('refuses --seed without --up', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['migrate:reset', '--seed', '--force'], databaseEnv(directory))

    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain('--seed requires --up')
  })
)

it.effect('rolls everything back and re-applies with seeding', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:reset', '--up', '--seed', '--force'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output).toContain('Rolling back 4 migration(s)')
    expect(result.output).toContain(`Rolled back ${MIGRATION_NAMES[0]}`)
    expect(result.output).toContain('Applying 4 migration(s)')
    expect(result.output).toContain(`Applied ${MIGRATION_NAMES[3]}`)
    expect(result.output).toContain('Seeding users')
    expect(result.output).toContain(`Seeded users (${USER_SEED_COUNT} records)`)
    expect(result.output).toContain('Reset complete')
  })
)
