import { Effect, Option } from 'effect'

const FLUSH_BUDGET = '5 seconds'

export const withinBudget = (sink: string, flush: Effect.Effect<void>): Effect.Effect<void> =>
  flush.pipe(
    Effect.timeoutOption(FLUSH_BUDGET),
    Effect.flatMap((done) =>
      Option.isSome(done)
        ? Effect.void
        : Effect.sync(() => {
            process.stderr.write(`${sink} log write did not finish in ${FLUSH_BUDGET}; moving on\n`)
          })
    )
  )
