import { Cause, Effect } from 'effect'
import { applicationRuntime } from '#/kernel/runtime.ts'
import { newRequestId } from '#/middleware/request-id.ts'
import { isQuietRequestPath, recordAccess, recordAccessFailure } from '#/middleware/request-log.ts'

// Dev-only page access log. The Effect stack never sees page traffic in dev —
// Start's dev middleware renders pages inside Vite — so the same access record
// is emitted here through the application runtime. API, metrics, and docs
// traffic stays out (the Effect stack logs and measures it in both modes) and
// quiet paths follow the shared list, so /_serverFn stays silent in dev as in
// prod. Production bundles evaluate the DEV guard to false and pass through.
export const devAccessLog = async (
  request: Request,
  next: () => Promise<Response>
): Promise<Response> => {
  if (!import.meta.env.DEV) return next()
  const pathname = new URL(request.url).pathname || '/'
  if (
    pathname.startsWith('/api/') ||
    pathname === '/metrics' ||
    pathname === '/api-docs' ||
    isQuietRequestPath(pathname)
  ) {
    return next()
  }
  const method = request.method
  const requestId = newRequestId().toString()
  const started = performance.now()
  // The pipeline hands back either a bare Response or a wrapper carrying one,
  // possibly from another realm where `instanceof` fails; read the status off
  // whatever shape arrives and keep the original return value.
  const statusOf = (value: unknown): number | undefined =>
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { status?: unknown }).status === 'number'
      ? (value as { status: number }).status
      : undefined
  try {
    const result = await next()
    const duration = Math.max(0, performance.now() - started)
    const carried = result as typeof result & { response?: unknown }
    const status = statusOf(result) ?? statusOf(carried.response) ?? 0
    void applicationRuntime
      .runPromise(
        recordAccess({
          method,
          path: pathname,
          status,
          duration,
          route: '*'
        }).pipe(Effect.annotateLogs({ requestId }))
      )
      .catch(() => undefined)
    return result
  } catch (error) {
    const duration = Math.max(0, performance.now() - started)
    void applicationRuntime
      .runPromise(
        recordAccessFailure({
          method,
          path: pathname,
          duration,
          route: '*',
          cause: Cause.fail(error)
        }).pipe(Effect.annotateLogs({ requestId }))
      )
      .catch(() => undefined)
    throw error
  }
}
