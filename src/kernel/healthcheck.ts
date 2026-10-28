import { Duration, Effect, Option, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import { Database } from '#/database/adapter.ts'
import type { api } from './http/api.ts'

// The health core follows alexliesenfeld/health's shape: named checks whose
// failure marks the component down, a per-check or shared timeout, and a
// report carrying the aggregate verdict plus per-check details. The API
// endpoint and the healthcheck command run the same checks through it.

/** A probe for one dependency; a failed check means the component is down. */
export interface HealthCheck<R = never> {
  readonly name: string
  readonly check: Effect.Effect<void, unknown, R>
  readonly timeout?: Duration.Input
}

export interface CheckResult {
  readonly status: 'up' | 'down'
  readonly timestamp: string
  readonly error?: string
}

export interface HealthReport {
  readonly status: 'ok' | 'unhealthy'
  readonly details: Readonly<Record<string, CheckResult>>
}

/**
 * The shared probe budget: bounded below the container probe timeout so a
 * hung dependency cannot keep either surface past its own budget.
 */
export const defaultCheckTimeout = Duration.seconds(2)

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const runCheck = <R>(
  input: HealthCheck<R>,
  fallbackTimeout: Duration.Input
): Effect.Effect<readonly [string, CheckResult], never, R> => {
  const timeout = Duration.fromInputUnsafe(input.timeout ?? fallbackTimeout)
  return Effect.gen(function* () {
    const done = yield* input.check.pipe(Effect.timeoutOption(timeout))
    const timestamp = new Date().toISOString()
    if (Option.isNone(done)) {
      return [
        input.name,
        { status: 'down', timestamp, error: `timed out after ${Duration.format(timeout)}` }
      ] as const
    }
    return [input.name, { status: 'up', timestamp }] as const
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(`Health check ${input.name} failed`).pipe(
        Effect.annotateLogs('error', describeError(error)),
        Effect.as([
          input.name,
          // The raw detail stays in the logs; the report carries a stable
          // code so the response body never echoes a dependency's error text.
          { status: 'down', timestamp: new Date().toISOString(), error: 'unavailable' }
        ] as const)
      )
    )
  )
}

/** Runs every check concurrently and aggregates the verdict. */
export const runHealthChecks = <R>(
  checks: ReadonlyArray<HealthCheck<R>>,
  options?: { readonly timeout?: Duration.Input }
): Effect.Effect<HealthReport, never, R> =>
  Effect.forEach(checks, (input) => runCheck(input, options?.timeout ?? defaultCheckTimeout), {
    concurrency: 'unbounded'
  }).pipe(
    Effect.map((entries) => {
      const details: Record<string, CheckResult> = {}
      let unhealthy = false
      for (const [name, result] of entries) {
        details[name] = result
        unhealthy = unhealthy || result.status === 'down'
      }
      return { status: unhealthy ? 'unhealthy' : 'ok', details }
    })
  )

/** The one shipped check: the database answers a readiness ping. */
export const databaseCheck: HealthCheck<Database> = {
  name: 'database',
  check: Database.use(({ ping }) => ping)
}

const CheckResultSchema = Schema.Struct({
  status: Schema.Literals(['up', 'down']),
  timestamp: Schema.String,
  error: Schema.optional(Schema.String)
}).annotate({ description: 'Result of one named health check' })

const HealthReportSchema = Schema.Struct({
  status: Schema.Literals(['ok', 'unhealthy']),
  details: Schema.Record(Schema.String, CheckResultSchema)
})

const Unhealthy = HealthReportSchema.pipe(HttpApiSchema.status(503))

export class HealthApi extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: HealthReportSchema,
    error: Unhealthy
  })
) {}

export const healthHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'health', (handlers) =>
    handlers.handle('health', () =>
      runHealthChecks([databaseCheck]).pipe(
        Effect.flatMap((report) =>
          report.status === 'ok' ? Effect.succeed(report) : Effect.fail(report)
        )
      )
    )
  )
