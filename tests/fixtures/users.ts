import { Effect, Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { UserRepositoryError } from '#/modules/user/user_repo.ts'
import { UserService } from '#/modules/user/user_service.ts'

export const user = (uuid: string, name: string) => ({
  id: TypeID.fromUUID('user', uuid).toString(),
  email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
  name,
  avatar_url: null,
  role: 20,
  email_verified: 1,
  data: null,
  disabled: 0,
  created_at: '2024-01-01 00:00:00',
  updated_at: '2024-01-01 00:00:00'
})

export const users = [
  user('01890a5d-ac96-774b-bcce-b302099a8057', 'Ada Lovelace'),
  user('01890a5d-ac96-774b-bcce-b302099a8058', 'Grace Hopper')
]

export const testService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.succeed(users),
    find: (id, bypass) =>
      Effect.succeed({
        user: users.find((candidate) => candidate.id === id.toString()),
        cache: bypass ? ('bypass' as const) : ('disabled' as const)
      })
  })
)

export const unavailableUserService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    find: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
  })
)

export const testServices = testService
