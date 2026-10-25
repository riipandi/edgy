import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vite-plus/test'
import { databaseEnv, failureOf, runCli, tempDirectory } from './harness.ts'

it.effect('answers Healthy against a reachable database', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    const result = yield* runCli(['healthcheck'], databaseEnv(directory))

    expect(failureOf(result)).toBe('')
    expect(result.output).toContain('Healthy')
    // The connect/close lines belong to serve; a one-shot command prints its
    // verdict alone.
    expect(result.logs).toEqual([])
  })
)

it.effect('answers Unhealthy when the database cannot be opened', () =>
  Effect.gen(function* () {
    const directory = yield* tempDirectory
    writeFileSync(join(directory, 'blocker'), '')
    const result = yield* runCli(['healthcheck'], {
      DATABASE_URL: `file:${join(directory, 'blocker', 'app.db')}`
    })

    expect(failureOf(result)).toBe('Unhealthy')
  })
)
