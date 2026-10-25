import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { USER_SEED_COUNT } from '#/database/seeders/user_factory.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './cli.ts'

it.effect('lists the seeders in a dry run', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:seed', '--dry-run'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output).toEqual([
      '1 seeder(s) would run (dry run):',
      `Would seed users (${USER_SEED_COUNT} records)`
    ])
  })
)

it.effect('seeds the users table', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:seed'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.output).toEqual(['Seeding users', `Seeded users (${USER_SEED_COUNT} records)`])
  })
)

it.effect('re-runs without failing on seeded rows', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)
    yield* runCli(['migrate:seed'], env)

    const again = yield* runCli(['migrate:seed'], env)

    expect(Exit.isSuccess(again.exit)).toBe(true)
  })
)

it.effect('fails before the schema exists', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['migrate:seed'], databaseEnv(directory))

    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain('SeederError')
  })
)
