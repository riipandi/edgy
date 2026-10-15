import { Effect } from 'effect'
import { CliError, Flag, Prompt } from 'effect/cli'

/** Plain console output for CLI commands. Bypasses the Effect logger, so no timestamp or level prefix. */
export const print = (...args: readonly unknown[]): Effect.Effect<void> =>
  Effect.sync(() => console.log(...args))

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
 * refused with a `UserError` (a non-zero exit, so a script notices) rather than run unasked.
 * Resolves `false` when the prompt is declined.
 *
 * Needs the platform services (`FileSystem`, `Path`, `Terminal`), supplied by `NodeServices.layer`
 * at the CLI root.
 */
export const confirmDestructive = (force: boolean, message: string) => {
  if (force) return Effect.succeed(true)
  if (!process.stdin.isTTY) {
    return ensure(false, `Refusing to run non-interactively without --force (${message})`).pipe(
      Effect.as(false)
    )
  }
  return Effect.gen(function* () {
    const confirmed = yield* Effect.orDie(Prompt.run(Prompt.Confirm({ message, initial: false })))
    if (!confirmed) yield* print('Aborted')
    return confirmed
  })
}

/**
 * `--remote`: run against the real D1 database the Worker uses, through the account `wrangler
 * login` signed in to, instead of the local copy. It always means D1, whatever `DATABASE_DRIVER`
 * says. Only the commands that are safe to point at production take it.
 */
export const remoteFlag = Flag.Boolean('remote').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Use the remote D1 database (needs `wrangler login`) instead of the local one'
  )
)

/** Says which database is about to be touched when it is not the local one. */
export const announceRemote = (remote: boolean): Effect.Effect<void> =>
  remote ? print('Remote D1 database') : Effect.void
