import { Effect } from 'effect'
import { Prompt } from 'effect/cli'

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
      Effect.logWarning(`Refusing to run non-interactively without --force (message: ${message})`),
      false
    )
  }
  return Effect.gen(function* () {
    const confirmed = yield* Effect.orDie(Prompt.run(Prompt.Confirm({ message, initial: false })))
    if (!confirmed) yield* Effect.logInfo('Aborted')
    return confirmed
  })
}
