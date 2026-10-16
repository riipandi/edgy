import { Effect, Option } from 'effect'

/** Longest one write of buffered log lines may take before the sink gives up on it. */
export const FLUSH_BUDGET = '5 seconds'

/**
 * Runs one flush of a log sink within {@link FLUSH_BUDGET}. A write that never returns (a full
 * pipe, a stuck disk) would stop the batcher loop for good: lines pile up in memory, and shutdown
 * waits until the process is killed. Past the budget the flush is abandoned with a note on stderr
 * and logging carries on.
 */
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
