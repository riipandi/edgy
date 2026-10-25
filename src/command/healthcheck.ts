import { Console, Duration, Effect } from 'effect'
import { CliError, Command } from 'effect/cli'
import { Database, DatabaseLayer } from '#/database/adapter.ts'

export const healthcheckCmd = Command.make('healthcheck').pipe(
  Command.withDescription('Check application readiness (database ping)'),
  Command.withHandler(() =>
    Database.use(({ ping }) => ping).pipe(
      // Bounded below the container probe timeout so a hung database
      // cannot keep the probe past its own budget.
      Effect.timeout(Duration.seconds(2)),
      Effect.tap(() => Console.log('Healthy')),
      Effect.provide(DatabaseLayer),
      Effect.catch((error) =>
        Effect.fail(new CliError.UserError({ cause: error, userMessage: 'Unhealthy' }))
      )
    )
  )
)
