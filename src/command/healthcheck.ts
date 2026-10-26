import { Console, Effect } from 'effect'
import { CliError, Command } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { databaseCheck, runHealthChecks } from '#/kernel/healthcheck.ts'

// The command and the API endpoint run the same checks through the same core,
// so the two surfaces can never drift apart on what "ready" means.
export const healthcheckCmd = Command.make('healthcheck').pipe(
  Command.withDescription('Check application readiness (the registered health checks)'),
  Command.withHandler(() =>
    runHealthChecks([databaseCheck]).pipe(
      Effect.provide(DatabaseLayer),
      // A layer that cannot even acquire (unopenable database) reads as
      // unhealthy too; the report-driven failure below is raised after this.
      Effect.catch((error) =>
        Effect.fail(new CliError.UserError({ cause: error, userMessage: 'Unhealthy' }))
      ),
      Effect.flatMap((report) =>
        report.status === 'ok'
          ? Console.log('Healthy').pipe(Effect.as(report))
          : Effect.fail(
              new CliError.UserError({
                cause: report.details,
                userMessage: 'Unhealthy'
              })
            )
      )
    )
  )
)
