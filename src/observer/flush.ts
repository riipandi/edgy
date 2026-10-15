import { Effect, Option } from 'effect'

/** Longest one write of buffered log lines may take before the sink gives up on it. */
export const FLUSH_BUDGET = '5 seconds'

/**
 * Runs one flush of a log sink within {@link FLUSH_BUDGET}. A sink whose write never returns (a
 * full pipe, a stuck disk) would otherwise stop the batcher's loop for good: lines would pile up
 * in memory, and at shutdown the final flush would wait until the process was killed. After the
 * budget the flush is abandoned with a note on stderr and logging carries on.
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
