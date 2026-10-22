import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { DatabaseLayer } from '#/database/layer.ts'
import { ConfigLayer } from '#/kernel/config/config.ts'
import { HealthServiceLayer } from '#/modules/health/health_service.ts'
import { UserRepositoryLayer } from '#/modules/user/user_repo.ts'
import { UserServiceLayer } from '#/modules/user/user_service.ts'
import { LoggerLayer } from '#/observer/logger.ts'
import { TelemetryRuntimeLayer } from '#/observer/tracing.ts'

const platformLayer = NodeServices.layer
const telemetryLayer = TelemetryRuntimeLayer
const loggerDependencies = Layer.mergeAll(platformLayer, telemetryLayer)

export const CoreLayer = Layer.mergeAll(
  platformLayer,
  telemetryLayer,
  LoggerLayer.pipe(Layer.provide(loggerDependencies))
).pipe(Layer.provideMerge(ConfigLayer))

const applicationServices = Layer.mergeAll(
  UserServiceLayer.pipe(Layer.provide(UserRepositoryLayer)),
  HealthServiceLayer
)

export const ApplicationLayer = applicationServices.pipe(Layer.provideMerge(DatabaseLayer))
