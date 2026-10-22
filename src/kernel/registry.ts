import { Layer } from 'effect'
import { HealthServiceLayer } from '#/modules/health/health_service.ts'
import { UserRepositoryLayer } from '#/modules/user/user_repo.ts'
import { UserServiceLayer } from '#/modules/user/user_service.ts'

export const applicationServices = Layer.mergeAll(
  UserServiceLayer.pipe(Layer.provide(UserRepositoryLayer)),
  HealthServiceLayer
)
