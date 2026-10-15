import { Effect } from 'effect'
import { Prompt } from 'effect/cli'

/**
 * Plain console output for CLI commands.
 *
 * Migration commands print user-facing output, not diagnostic logs, so they
 * bypass the configured Effect logger (`ObservabilityLayer`). This keeps the
 * output clean — no timestamp, no log-level prefix:
 *
 * ```
 * Rolled back 1 migration(s)
 * Re-applied 1 migration(s)
 * Running seeders...
 * Seeders completed
 * ```
 */
export const print = (...args: readonly unknown[]): Effect.Effect<void> =>
  Effect.sync(() => console.log(...args))

/** Same as {@link print}, but writes to stderr (warnings and refusals). */
export const printWarning = (...args: readonly unknown[]): Effect.Effect<void> =>
  Effect.sync(() => console.error(...args))

/**
 * Asks the user for confirmation before a destructive operation
 * (`migrate:down`, `migrate:reset`).
 *
 * - `--force` skips the prompt entirely.
 * - Without a TTY the prompt cannot run, so the command refuses and asks for
 *   `--force` instead of hanging or guessing.
 *
 * Returns `false` when the user denies, so callers can log and bail out.
 *
 * Requires the platform services (`FileSystem`, `Path`, `Terminal`), supplied
 * by `NodeServices.layer` at the CLI root.
 */
export const confirmDestructive = (force: boolean, message: string) => {
  if (force) return Effect.succeed(true)
  if (!process.stdin.isTTY) {
    return Effect.as(
      printWarning(`Refusing to run non-interactively without --force (${message})`),
      false
    )
  }
  return Effect.gen(function* () {
    const confirmed = yield* Effect.orDie(Prompt.run(Prompt.Confirm({ message, initial: false })))
    if (!confirmed) yield* print('Aborted')
    return confirmed
  })
}
