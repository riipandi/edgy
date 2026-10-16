import { Cause, Effect, ErrorReporter, Option } from 'effect'
import { currentRequestId } from '../kernel/http/request_context.ts'
import { redactText } from '../kernel/redact.ts'

/** `error.code` of the application error behind a cause, when there is one. */
const codeOf = (cause: Cause.Cause<unknown>): string | undefined => {
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return undefined
  const { value } = failure
  return typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string'
    ? value.code
    : undefined
}

/**
 * The one place a failed request is reported. Programs run through `runProgram` (API and pages)
 * are wrapped in `Effect.withErrorReporting`, which hands each reportable failure to the
 * reporters here, once per error. Duplicates and interruptions, such as a client hanging up, are
 * skipped.
 *
 * The error decides what is reportable. An `AppError` below 500 carries `ErrorReporter.ignore`
 * (a missing user is not an incident); a database failure, a timeout or a defect arrives here.
 * The default reporter logs them at `Error`, annotated with the `errorCode` the client received
 * and with the cause **redacted**: a driver's message can quote a connection string or a
 * credential, and logs leave the process. The logger runs on the failing fiber's context, so it
 * reaches every configured sink.
 *
 * To send failures elsewhere (Sentry, a pager), add a reporter to the list in
 * `ErrorReporter.layer`. It receives the same deduplicated stream and must redact with
 * `redactText` before sending.
 */
export const ErrorReporterLayer = ErrorReporter.layer([
  ErrorReporter.make(({ cause, fiber }) => {
    const requestId = currentRequestId()
    const errorCode = codeOf(cause)
    Effect.runSyncWith(fiber.context)(
      Effect.logError('Request failed', redactText(Cause.pretty(cause))).pipe(
        Effect.annotateLogs({
          ...(requestId === undefined ? {} : { requestId }),
          ...(errorCode === undefined ? {} : { errorCode })
        })
      )
    )
  })
])
