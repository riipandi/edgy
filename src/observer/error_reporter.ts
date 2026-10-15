import { Effect, ErrorReporter } from 'effect'
import { currentRequestId } from '../kernel/http/request_context.ts'

/**
 * The one place a failed request is reported. `runEffect` wraps every program in
 * `Effect.withErrorReporting`; Effect then hands each *reportable* failure to the
 * reporters registered here, once per error (it deduplicates, and skips
 * interruptions such as a client hanging up).
 *
 * What is reportable is decided by the error, not by this file: an `AppError` below
 * 500 carries `ErrorReporter.ignore` (a missing user is not an incident), while a
 * database failure, a timeout and any unexpected defect do not, so they arrive here.
 * The default reporter writes them to the Effect logger at `Error` with the cause, the
 * same line the request log already shows, now from a single place. The logger runs on
 * the failing fiber's own context, so it reaches whatever sinks are configured —
 * console, file, OTLP.
 *
 * To send failures somewhere else (Sentry, a pager), add a reporter to the list in
 * `ErrorReporter.layer`; it receives the same deduplicated, pre-filtered stream.
 */
export const ErrorReporterLayer = ErrorReporter.layer([
  ErrorReporter.make(({ cause, fiber }) => {
    const requestId = currentRequestId()
    Effect.runSyncWith(fiber.context)(
      Effect.logError('Request failed', cause).pipe(
        Effect.annotateLogs(requestId === undefined ? {} : { requestId })
      )
    )
  })
])
