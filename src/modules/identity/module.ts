import { Layer } from 'effect'
import { UserLayer } from './user/user_layer.ts'

export { UsersApi } from './user/user_route.ts'
export { usersHandlers } from './user/user_handler.ts'

// The module contract: the kernel imports only this index — layer (the
// self-wired service graph) and group (UsersApi); handlers stay a factory
// because an eager group layer would cycle the api value at runtime.
export const identityLayer = Layer.mergeAll(UserLayer)
