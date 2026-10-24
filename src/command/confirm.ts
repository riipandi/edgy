import { Console, Effect } from 'effect'
import { CliError, Prompt } from 'effect/cli'

/**
 * Asks before a destructive step. `--force` skips the prompt; without a TTY the
 * answer is a refusal, so a scripted run never hangs waiting for input.
 */
export const confirmDestructive = (force: boolean, message: string, refusal: string) => {
  if (force) return Effect.succeed(true)
  if (!process.stdin.isTTY)
    return Effect.fail(new CliError.UserError({ cause: refusal, userMessage: refusal }))
  return Effect.gen(function* () {
    const confirmed = yield* Prompt.Confirm({ message, initial: false })
    if (!confirmed) yield* Console.log('Aborted')
    return confirmed
  })
}
