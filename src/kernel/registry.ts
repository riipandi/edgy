import { Layer } from 'effect'
import { HealthServiceLayer } from '#/modules/health/health_service.ts'
import { UserRepositoryLayer } from '#/modules/user/user_repo.ts'
import { UserCache, UserServiceLayer } from '#/modules/user/user_service.ts'

const userDependencies = Layer.mergeAll(UserRepositoryLayer, UserCache.layer).pipe(
  Layer.provide(UserRepositoryLayer)
)

export const applicationServices = Layer.mergeAll(
  UserServiceLayer.pipe(Layer.provide(userDependencies)),
  HealthServiceLayer
)
