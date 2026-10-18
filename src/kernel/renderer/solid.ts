import { NodeHttpServerRequest } from '@effect/platform-node'
import { Effect } from 'effect'
import { InternalError } from 'effect/http/HttpServerError'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { Path } from 'effect/Path'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const distRoot =
  path.basename(moduleDir) === 'renderer' ? path.resolve(moduleDir, '../../../dist') : moduleDir
const clientRoot = path.join(distRoot, 'client')

const mimeTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
}

const loadBundle = () =>
  import(pathToFileURL(path.join(distRoot, 'server/server.js')).href) as Promise<{
    handleRequest: (
      request: Request,
      options?: { readonly event?: { readonly nativeEvent?: unknown } }
    ) => Promise<Response>
  }>

export const renderPage = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(request.originalUrl, 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  const paths = yield* Path

  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    pathname !== '/' &&
    !pathname.includes('..') &&
    !pathname.includes('\0')
  ) {
    const filePath = paths.resolve(clientRoot, pathname.slice(1))
    const insideClient = filePath === clientRoot || filePath.startsWith(clientRoot + paths.sep)
    if (insideClient) {
      const contentType = mimeTypes[path.extname(filePath)]
      const staticFile = yield* HttpServerResponse.file(
        filePath,
        contentType === undefined ? undefined : { contentType }
      ).pipe(Effect.option)
      if (staticFile._tag === 'Some') return staticFile.value
    }
  }

  const serverBundle = yield* Effect.promise(loadBundle)
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      serverBundle.handleRequest(new Request(webRequest, { signal }), {
        event: { nativeEvent: NodeHttpServerRequest.toIncomingMessage(request) }
      }),
    catch: (cause) => new InternalError({ request, cause })
  })
  return HttpServerResponse.fromWeb(response)
})
