import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { expect } from 'vite-plus/test'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './harness.ts'

it.effect('rejects a count below one', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['migrate:down', '--count', '0'], databaseEnv(directory))

    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain('--count must be at least 1')
  })
)

it.effect('lists what a rollback would remove without changing the schema', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:down', '--count', '2', '--dry-run'], env)

    expect(result.logs).toContain(`would rollback ${MIGRATION_NAMES[3]}`)
    expect(result.logs).toContain(`would rollback ${MIGRATION_NAMES[2]}`)

    const status = yield* runCli(['migrate:status'], env)
    expect(status.logs.filter((line) => line.includes('Z'))).toHaveLength(MIGRATION_NAMES.length)
  })
)

it.effect('refuses to roll back non-interactively without --force', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:down'], env)

    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain('non-interactive session: pass --force')

    const status = yield* runCli(['migrate:status'], env)
    expect(status.logs.filter((line) => line.includes('Z'))).toHaveLength(MIGRATION_NAMES.length)
  })
)

it.effect('rolls back the requested number of migrations with --force', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    yield* runCli(['migrate:up'], env)

    const result = yield* runCli(['migrate:down', '--force'], env)
    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.logs).toContain(`Success ${MIGRATION_NAMES[3]}`)

    const status = yield* runCli(['migrate:status'], env)
    expect(status.logs.filter((line) => line.includes('Z'))).toHaveLength(
      MIGRATION_NAMES.length - 1
    )
    expect(status.logs).toContain(`${MIGRATION_NAMES[3]} pending`)
  })
)

it.effect('reports an empty schema instead of failing', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['migrate:down', '--force'], databaseEnv(directory))

    expect(Exit.isSuccess(result.exit)).toBe(true)
    expect(result.logs).toContain('no executed migrations to roll back')
  })
)
