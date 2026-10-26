import { Layer } from 'effect'
import { UserRepositoryLayer } from './user_repo.ts'
import { UserCache, UserServiceLayer } from './user_service.ts'

// The module wires its own service graph: the composition root only supplies
// AppConfig, Scope, and Database.
export const UserLayer = UserServiceLayer.pipe(
  Layer.provide(UserCache.layer),
  Layer.provide(UserRepositoryLayer)
)
