import { Effect } from 'effect'
import { CliError, Prompt } from 'effect/cli'

/** Plain console output for CLI commands. Bypasses the Effect logger, so no timestamp or level prefix. */
export const print = (...args: readonly unknown[]): Effect.Effect<void> =>
  Effect.sync(() => console.log(...args))

/** Like {@link print}, but writes to stderr. */
export const printWarning = (...args: readonly unknown[]): Effect.Effect<void> =>
  Effect.sync(() => console.error(...args))

/**
 * Fails with a `UserError` (a usage message, not a stack trace) unless
 * `condition` holds. Use it for flag combinations the parser cannot reject.
 */
export const ensure = (
  condition: boolean,
  message: string
): Effect.Effect<void, CliError.UserError> =>
  condition
    ? Effect.void
    : Effect.fail(new CliError.UserError({ cause: message, userMessage: message }))

/**
 * Asks before a destructive operation. `--force` skips the prompt. Without a TTY the operation is
 * refused rather than run unasked. Resolves `false` when declined.
 *
 * Needs the platform services (`FileSystem`, `Path`, `Terminal`), supplied by `NodeServices.layer`
 * at the CLI root.
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
