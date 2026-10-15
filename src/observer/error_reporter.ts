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
 * The one place a failed request is reported. `runEffect` wraps every program in
 * `Effect.withErrorReporting`; Effect then hands each *reportable* failure to the
 * reporters registered here, once per error (it deduplicates, and skips
 * interruptions such as a client hanging up).
 *
 * What is reportable is decided by the error, not by this file: an `AppError` below
 * 500 carries `ErrorReporter.ignore` (a missing user is not an incident), while a
 * database failure, a timeout and any unexpected defect do not, so they arrive here.
 * The default reporter writes them to the Effect logger at `Error`, annotated with the
 * `errorCode` the client was given and with the cause **redacted**: a driver's message can
 * quote a connection string or a credential, and the log is shipped to places the process
 * does not control. The logger runs on the failing fiber's own context, so it reaches
 * whatever sinks are configured: console, file, OTLP.
 *
 * To send failures somewhere else (Sentry, a pager), add a reporter to the list in
 * `ErrorReporter.layer`; it receives the same deduplicated, pre-filtered stream, and
 * should redact (`kernel/redact.ts`) before it sends.
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
