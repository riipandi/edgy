import { describe, expect, it, vi } from '@effect/vitest'
import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { withinBudget } from './flush.ts'

describe('withinBudget', () => {
  it.effect('lets a flush that finishes run to completion, saying nothing', () =>
    Effect.gen(function* () {
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      let written = false
      yield* withinBudget(
        'file',
        Effect.sync(() => (written = true))
      )
      expect(written).toBe(true)
      expect(stderr).not.toHaveBeenCalled()
      stderr.mockRestore()
    })
  )

  it.effect('gives up on a write that never returns, so shutdown cannot hang on it', () =>
    Effect.gen(function* () {
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const fiber = yield* Effect.forkChild(withinBudget('file', Effect.never))
      yield* TestClock.adjust('6 seconds')
      yield* Fiber.join(fiber)

      expect(String(stderr.mock.calls[0]?.[0])).toContain('file log write did not finish')
      stderr.mockRestore()
    })
  )
})
