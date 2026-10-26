import { Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as OpenApi from 'effect/http-api/OpenApi'
import { healthHandlers, HealthApi } from '#/kernel/healthcheck.ts'
import { identityLayer, UsersApi, usersHandlers } from '#/modules/identity/module.ts'
import pkg from '../../package.json' with { type: 'json' }

// The one file a module registers into: its HttpApiGroup here, its handlers
// factory in moduleHandlerLayer, its service layer in moduleServiceLayer. A
// new module edits this file and its own module.ts — nothing else in the
// kernel.
export const api = HttpApi.make(pkg.name)
  .add(HealthApi, UsersApi)
  .annotate(OpenApi.Title, pkg.name)
  .annotate(OpenApi.Version, pkg.version)
  .prefix('/api')

export const moduleServiceLayer = Layer.mergeAll(identityLayer)

export const moduleHandlerLayer = (httpApi: typeof api) =>
  Layer.mergeAll(healthHandlers(httpApi), usersHandlers(httpApi))
