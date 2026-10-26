import { Layer } from 'effect'
import { UserRepositoryLayer } from '#/modules/identity/user/user_repo.ts'
import { UserCache, UserServiceLayer } from '#/modules/identity/user/user_service.ts'

const userDeps = Layer.mergeAll(UserRepositoryLayer, UserCache.layer).pipe(
  Layer.provide(UserRepositoryLayer)
)

export const applicationServices = Layer.mergeAll(UserServiceLayer.pipe(Layer.provide(userDeps)))
