import { Layer } from 'effect'
import { UserRepositoryLayer } from '#/modules/user/user_repo.ts'
import { UserCache, UserServiceLayer } from '#/modules/user/user_service.ts'

const userDeps = Layer.mergeAll(UserRepositoryLayer, UserCache.layer).pipe(
  Layer.provide(UserRepositoryLayer)
)

export const applicationServices = Layer.mergeAll(UserServiceLayer.pipe(Layer.provide(userDeps)))
