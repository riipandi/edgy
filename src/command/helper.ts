import { Console, Effect } from 'effect'
import { CliError, Prompt, TerminalCapabilities } from 'effect/cli'
import { QuitError } from 'effect/Terminal'

const RESET = '\u001b[0m'
const CYAN = '\u001b[36m'
const GREEN = '\u001b[32m'
const YELLOW = '\u001b[33m'

export interface Reporter {
  /** A step is beginning; its results follow, indented. */
  readonly start: (message: string) => Effect.Effect<void>
  /** A step finished successfully. */
  readonly ok: (message: string) => Effect.Effect<void>
  /** A dry-run preview of what would happen. */
  readonly warn: (message: string) => Effect.Effect<void>
  /** An empty line separating one grouped phase from the next. */
  readonly space: () => Effect.Effect<void>
}

// The one-shot commands present through the console, not the logger: no
// timestamps, and the color carries the state the words name.
export const reporter: Effect.Effect<Reporter> = Effect.map(
  TerminalCapabilities.TerminalCapabilities,
  (capabilities) => {
    const paint =
      (color: string) =>
      (text: string): string =>
        capabilities.canColor ? `${color}${text}${RESET}` : text
    const print = (color: string) => (message: string) => Console.log(paint(color)(message))
    return {
      start: print(CYAN),
      ok: print(GREEN),
      warn: print(YELLOW),
      space: () => Console.log('')
    }
  }
)

/**
 * Asks before a destructive step. `--force` skips the prompt; without a TTY the
 * answer is a refusal, so a scripted run never hangs waiting for input.
 */
export const confirmDestructive = (
  force: boolean,
  message: string,
  refusal: string
): Effect.Effect<boolean, CliError.CliError | QuitError, Prompt.Environment> => {
  if (force) return Effect.succeed(true)
  if (!process.stdin.isTTY)
    return Effect.fail(new CliError.UserError({ cause: refusal, userMessage: refusal }))
  return Effect.gen(function* () {
    const confirmed = yield* Prompt.Confirm({ message, initial: false })
    if (!confirmed) yield* Console.log('Aborted')
    return confirmed
  })
}
