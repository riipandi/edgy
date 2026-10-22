import { Effect, Layer, ManagedRuntime } from 'effect'
import { DatabaseLayer } from '#/database/layer.ts'
import { CoreLayer } from '#/layers.ts'
import { UserRepoLayer } from './user_repo.ts'
import { UserService, UserServiceLayer } from './user_service.ts'

const runtime = ManagedRuntime.make(
  UserServiceLayer.pipe(
    Layer.provide(UserRepoLayer),
    Layer.provide(DatabaseLayer),
    Layer.provideMerge(CoreLayer)
  )
)

export const listUsersFromService = () =>
  runtime.runPromise(
    Effect.gen(function* () {
      const users = yield* UserService
      return yield* users.list()
    })
  )

export const getUserFromService = (id: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const users = yield* UserService
      return yield* users.find(id)
    })
  )
