import { Duration, Effect, Layer } from 'effect'
import { Command } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { HealthService, HealthServiceLayer } from '#/modules/health/health_service.ts'

export const healthcheckCmd = Command.make('healthcheck').pipe(
  Command.withDescription('Check application readiness (database ping)'),
  Command.withHandler(() =>
    HealthService.use((health) => health.check)
      .pipe(
        // Bounded below the container probe timeout so a hung database cannot
        // keep the probe past its own budget.
        Effect.timeout(Duration.seconds(2)),
        Effect.tap(() => Effect.logInfo('healthy'))
      )
      .pipe(Effect.provide(HealthServiceLayer.pipe(Layer.provide(DatabaseLayer))))
  )
)
