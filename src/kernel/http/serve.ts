import { NodeHttpServer } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { createServer } from 'node:http'
import { AppConfig } from '#/kernel/config/app-config.ts'
import { renderPage } from '#/kernel/renderer/solid.ts'
import { requestId } from '#/middleware/request-id.ts'
import { requestLog } from '#/middleware/request-log.ts'
import { api } from './api.ts'

export const server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    return HttpRouter.serve(
      Layer.mergeAll(api, HttpRouter.add('*', '*', renderPage), requestId, requestLog)
    ).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { host: config.host, port: config.port }))
    )
  })
)
