import { Effect } from 'effect'
import { InternalError, type RequestError } from 'effect/http/HttpServerError'
import * as HttpServerError from 'effect/http/HttpServerError'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as HttpStaticServer from 'effect/http/HttpStaticServer'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AppConfig } from '#/kernel/config/config.ts'
import { cspNonce } from '#/kernel/csp_nonce.ts'
import { cspFor } from '#/middleware/security-headers.ts'
import { withUserService } from '#/modules/identity/user/user_context.ts'
import { UserService } from '#/modules/identity/user/user_service.ts'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

// The bundled server lives under <root>/server while client assets sit under
// <root>/client; resolve the root by probing for the server bundle beside the
// entry or up the tree from the source layout during development.
const distRoot = (() => {
  const probe = (dir: string): boolean => existsSync(path.join(dir, 'server/server.js'))
  let dir = moduleDir
  for (let i = 0; i < 6; i++) {
    if (probe(dir)) return dir
    if (path.basename(dir) === 'dist') return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(moduleDir, '../dist')
})()

const clientRoot = path.join(distRoot, 'client')

const loadBundle = () =>
  import(pathToFileURL(path.join(distRoot, 'server/server.js')).href) as Promise<{
    default: {
      fetch: (request: Request, options?: { context?: { nonce?: string } }) => Promise<Response>
    }
  }>

const renderFromBundle = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const userService = yield* UserService
  const response = yield* Effect.tryPromise({
    try: async (signal) => {
      const serverBundle = await loadBundle()
      return withUserService(userService, () =>
        serverBundle.default.fetch(new Request(webRequest, { signal }))
      )
    },
    catch: (cause) => new InternalError({ request, cause })
  })
  return HttpServerResponse.setHeaders({
    'content-security-policy': cspFor(cspNonce)
  })(HttpServerResponse.fromWeb(response))
})

let staticHandlerMemo:
  | Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      HttpServerError.HttpServerError,
      HttpServerRequest.HttpServerRequest
    >
  | undefined

// Vite writes every bundled asset under `assets/` with a content hash in its
// name, so a cached copy can never go stale. Files at the client root
// (favicon) carry no hash and keep the default revalidation.
const isHashedAsset = (pathname: string): boolean => pathname.startsWith('/assets/')

const immutable = 'public, max-age=31536000, immutable'

// Built once and reused: constructing the static handler per request would
// rebuild its mime map and closures on every miss. The build reads no files,
// so its failure channel is a defect, not a request error.
const staticHandler = Effect.suspend(() => {
  const memo = staticHandlerMemo
  return (
    memo ??
    Effect.flatMap(
      Effect.orDie(HttpStaticServer.make({ root: clientRoot, index: 'index.html' })),
      (handler) => {
        staticHandlerMemo = handler
        return handler
      }
    )
  )
})

export const renderPage = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const baseUrl = (yield* AppConfig).app.baseUrl
  const { pathname } = new URL(request.originalUrl, baseUrl)
  if ((request.method === 'GET' || request.method === 'HEAD') && pathname !== '/') {
    return yield* staticHandler.pipe(
      Effect.map((response) =>
        isHashedAsset(pathname)
          ? HttpServerResponse.setHeader(response, 'cache-control', immutable)
          : response
      ),
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
