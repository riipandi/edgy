import { NodeHttpServerRequest } from '@effect/platform-node'
import { Effect } from 'effect'
import { InternalError, type RequestError } from 'effect/http/HttpServerError'
import * as HttpServerError from 'effect/http/HttpServerError'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as HttpStaticServer from 'effect/http/HttpStaticServer'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { UserService } from '#/modules/user/user_service.ts'
import { withUserService } from '#/modules/user/user_ssr.ts'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
// The bundled server lives under dist/server while client assets sit under
// dist/client; walk up to the shared dist root, falling back to the source
// tree layout during development.
const distRoot = (() => {
  let dir = moduleDir
  for (let i = 0; i < 5; i++) {
    if (path.basename(dir) === 'dist') return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(moduleDir, '../../dist')
})()
const clientRoot = path.join(distRoot, 'client')

const loadBundle = () =>
  import(pathToFileURL(path.join(distRoot, 'server/server.js')).href) as Promise<{
    handleRequest: (
      request: Request,
      options?: { readonly event?: { readonly nativeEvent?: unknown } }
    ) => Promise<Response>
  }>

const renderFromBundle = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const userService = yield* UserService
  const response = yield* Effect.tryPromise({
    try: async (signal) => {
      const serverBundle = await loadBundle()
      return withUserService(userService, () =>
        serverBundle.handleRequest(new Request(webRequest, { signal }), {
          event: { nativeEvent: NodeHttpServerRequest.toIncomingMessage(request) }
        })
      )
    },
    catch: (cause) => new InternalError({ request, cause })
  })
  return HttpServerResponse.fromWeb(response)
})

export const renderPage = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const { pathname } = new URL(request.originalUrl, 'http://localhost')
  if ((request.method === 'GET' || request.method === 'HEAD') && pathname !== '/') {
    const staticFiles = yield* HttpStaticServer.make({ root: clientRoot, index: 'index.html' })
    return yield* staticFiles.pipe(
      Effect.catch(
        (
          error
        ): Effect.Effect<
          HttpServerResponse.HttpServerResponse,
          HttpServerError.HttpServerError | RequestError,
          HttpServerRequest.HttpServerRequest | UserService
        > =>
          HttpServerError.isHttpServerError(error) && error.reason._tag === 'RouteNotFound'
            ? renderFromBundle
            : Effect.fail(error)
      )
    )
  }
  return yield* renderFromBundle
})
