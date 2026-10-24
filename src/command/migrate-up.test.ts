import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { join } from 'node:path'
import { expect } from 'vite-plus/test'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './harness.ts'

const applied = (logs: ReadonlyArray<string>): ReadonlyArray<string> =>
  logs.filter((line) => line.includes('T') && line.includes('Z'))

it.effect('applies every pending migration', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)

    const result = yield* runCli(['migrate:up'], env)

    expect(Exit.isSuccess(result.exit)).toBe(true)
    for (const name of MIGRATION_NAMES) expect(result.logs).toContain(`Success ${name}`)
  })
)

it.effect('--to applies the migrations up to the named one only', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    const target = MIGRATION_NAMES[1] as string

    const dryRun = yield* runCli(['migrate:up', '--to', target, '--dry-run'], env)
    expect(dryRun.logs).toEqual([
      `connecting database local ${join(directory, 'edgy.db')}`,
      'database connected',
      `pending ${MIGRATION_NAMES[0]}`,
      `pending ${target}`,
      'closing database connection',
      'database connection closed'
    ])

    const applied = yield* runCli(['migrate:up', '--to', target], env)
    expect(applied.logs).toContain(`Success ${MIGRATION_NAMES[0]}`)
    expect(applied.logs).toContain(`Success ${target}`)
    expect(applied.logs).not.toContain(`Success ${MIGRATION_NAMES[2]}`)

    const status = yield* runCli(['migrate:status'], env)
    expect(status.logs.filter((line) => line.includes('Z'))).toHaveLength(2)
  })
)

it.effect('refuses an applied target instead of rolling the schema back', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)
    const target = MIGRATION_NAMES[1] as string

    yield* runCli(['migrate:up'], env)

    const refused = yield* runCli(['migrate:up', '--to', target], env)
    expect(Exit.isFailure(refused.exit)).toBe(true)
    expect(failureOf(refused)).toContain(`migration '${target}' is already applied`)

    const dryRun = yield* runCli(['migrate:up', '--to', target, '--dry-run'], env)
    expect(Exit.isFailure(dryRun.exit)).toBe(true)
    expect(failureOf(dryRun)).toContain(`migration '${target}' is already applied`)

    // The schema still holds every migration: nothing was rolled back.
    const status = yield* runCli(['migrate:status'], env)
    expect(applied(status.logs)).toHaveLength(MIGRATION_NAMES.length)
  })
)

it.effect('refuses a target it does not know', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)

    const result = yield* runCli(['migrate:up', '--to', 'nope'], env)

    expect(Exit.isFailure(result.exit)).toBe(true)
    expect(failureOf(result)).toContain("unknown migration 'nope'")
  })
)

it.effect('reports a fully applied schema as up to date', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const env = databaseEnv(directory)

    yield* runCli(['migrate:up'], env)
    const again = yield* runCli(['migrate:up'], env)

    expect(Exit.isSuccess(again.exit)).toBe(true)
    expect(again.logs).toContain('database is up to date')
  })
)
