import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import { UserSchema } from './user_schema.ts'

/**
 * The procedures the pages consume over `/rpc` (plan-20261018_0105, D3). `/rpc` is internal
 * surface: the schemas share the module's resource shapes with `/api`, but the transport answers
 * ndjson through the rpc codec, not the API envelope, and nothing here is described by OpenAPI.
 * The list payload takes a number: a JSON body, not a query string.
 */
export const UserRpcs = RpcGroup.make(
  Rpc.make('userList', {
    payload: Schema.Struct({ limit: Schema.Number }),
    success: Schema.Struct({ users: Schema.Array(UserSchema) }),
    error: Schema.Struct({ code: Schema.String, message: Schema.String })
  })
)
