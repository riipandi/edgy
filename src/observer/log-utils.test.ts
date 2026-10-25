import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import { withinBudget } from './log-utils.ts'

it('passes a fast flush through without a warning', async () => {
  const writes: Array<string> = []
  const original = process.stderr.write.bind(process)
  process.stderr.write = ((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  try {
    await Effect.runPromise(withinBudget('stdout', Effect.void))
    expect(writes).toEqual([])
  } finally {
    process.stderr.write = original
  }
})

it.effect('warns and moves on when the flush hangs past the budget', () =>
  Effect.gen(function* () {
    const writes: Array<string> = []
    const original = process.stderr.write.bind(process)
    process.stderr.write = ((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    yield* Effect.forkScoped(withinBudget('stdout', Effect.never))
    yield* TestClock.adjust('5 seconds')
    process.stderr.write = original
    expect(writes).toEqual(['stdout log write did not finish in 5 seconds; moving on\n'])
  })
)
