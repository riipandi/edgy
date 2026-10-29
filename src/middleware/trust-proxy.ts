import { Effect, Option } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig } from '#/kernel/config/config.ts'
import { isTrustedProxy, type TrustProxy } from '#/kernel/config/security.ts'

// The rightmost X-Forwarded-For entry that is not itself a trusted proxy;
// when every entry is trusted, the chain's leftmost entry is the client.
export const xForwardedClient = (header: string, trust: TrustProxy): string | undefined => {
  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (entries.length === 0) return undefined
  let index = entries.length - 1
  while (index > 0 && isTrustedProxy(trust, entries[index]!)) index -= 1
  return entries[index]
}

// Resolves the client address for a request whose direct peer is a trusted
// proxy; spoofed headers from untrusted peers are ignored.
export const resolveClientIp = (
  request: HttpServerRequest.HttpServerRequest,
  trust: TrustProxy
): HttpServerRequest.HttpServerRequest => {
  const peer = Option.getOrUndefined(request.remoteAddress)
  if (peer === undefined || !isTrustedProxy(trust, peer)) return request
  const forwarded = request.headers['x-forwarded-for']
  const client =
    (forwarded === undefined ? undefined : xForwardedClient(forwarded, trust)) ??
    request.headers['x-real-ip']
  if (client === undefined) return request
  return request.modify({ remoteAddress: Option.some(client) })
}

export const trustProxyMiddleware = HttpRouter.middleware(
  Effect.map(
    AppConfig,
    (config) => (httpEffect) =>
      Effect.updateService(httpEffect, HttpServerRequest.HttpServerRequest, (request) =>
        resolveClientIp(request, config.security.trustProxy)
      )
  ),
  { global: true }
)
