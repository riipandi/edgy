import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vite-plus/test'
import { databaseEnv, failureOf, runCli, tempDirectory } from './cli.ts'

it.effect('refuses --seed without --auto-migrate', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['serve', '--seed'], databaseEnv(directory))
    expect(failureOf(result)).toBe('--seed requires --auto-migrate or DATABASE_AUTO_MIGRATE=true')
  })
)
