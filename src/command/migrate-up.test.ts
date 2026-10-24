import { it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { join } from 'node:path'
import { expect } from 'vite-plus/test'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { databaseEnv, failureOf, runCli, tempDirectory } from './harness.ts'

/** The status lines: one per migration, each carrying its ISO execution time. */
const statusLines = (logs: ReadonlyArray<string>): ReadonlyArray<string> =>
  logs.filter((line) => /\d{4}-\d{2}-\d{2}T/.test(line))

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
      `Connecting database local ${join(directory, 'app-test.db')}`,
      'Database connected',
      `Pending ${MIGRATION_NAMES[0]}`,
      `Pending ${target}`,
      'Closing database connection',
      'Database connection closed'
    ])

    const applied = yield* runCli(['migrate:up', '--to', target], env)
    expect(applied.logs).toContain(`Success ${MIGRATION_NAMES[0]}`)
    expect(applied.logs).toContain(`Success ${target}`)
    expect(applied.logs).not.toContain(`Success ${MIGRATION_NAMES[2]}`)

    const status = yield* runCli(['migrate:status'], env)
    expect(statusLines(status.logs)).toHaveLength(2)
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
    expect(statusLines(status.logs)).toHaveLength(MIGRATION_NAMES.length)
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
    expect(again.logs).toContain('Database is up to date')
  })
)
