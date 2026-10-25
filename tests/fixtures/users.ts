import { Effect, Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { UserRepositoryError } from '#/modules/user/user_repo.ts'
import type { User } from '#/modules/user/user_schema.ts'
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

export const users: Array<User> = [
  user('01890a5d-ac96-774b-bcce-b302099a8057', 'Ada Lovelace'),
  user('01890a5d-ac96-774b-bcce-b302099a8058', 'Grace Hopper')
]

// The fake mutates the module-level `users` array, so write-path tests can
// assert against the same records the read tests see.
const create: UserService['Service']['create'] = (values) => {
  const row = {
    ...user('0199c0d5-ac96-774b-bcce-b302099a9001', 'Created User'),
    email: values.email,
    name: values.name,
    avatar_url: values.avatar_url
  }
  users.push(row)
  return Effect.succeed(row)
}
const update: UserService['Service']['update'] = (id, patch) => {
  const row = users.find((candidate) => candidate.id === id.toString())
  if (row === undefined) return Effect.succeed(undefined)
  const merged = {
    ...row,
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {})
  }
  users.splice(users.indexOf(row), 1, merged)
  return Effect.succeed(merged)
}
const remove: UserService['Service']['remove'] = (id) => {
  const index = users.findIndex((candidate) => candidate.id === id.toString())
  if (index < 0) return Effect.succeed(false)
  users.splice(index, 1)
  return Effect.succeed(true)
}

export const testServices = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.succeed(users),
    find: (id, bypass) =>
      Effect.succeed({
        user: users.find((candidate) => candidate.id === id.toString()),
        cache: bypass ? ('bypass' as const) : ('disabled' as const)
      }),
    create,
    update,
    remove
  })
)

export const unavailableUserService = Layer.succeed(
  UserService,
  UserService.of({
    list: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    find: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    create: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    update: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') })),
    remove: () => Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
  })
)
