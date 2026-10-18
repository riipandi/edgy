import { Context, Effect, Layer, Scope } from 'effect'
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { RpcSerialization, RpcServer } from 'effect/rpc'
import type { Rpc, RpcGroup } from 'effect/rpc'
import type { H3, H3Event, H3Plugin } from 'h3'

/** The built rpc web handler, provided by the layer below. */
export class RpcHandler extends Context.Service<
  RpcHandler,
  {
    readonly handle: (request: Request) => Promise<Response>
  }
>()('kernel/http/RpcHandler') {}

/**
 * The internal RPC surface (plan-20261018_0105, D3): `POST /rpc`, ndjson, served by `effect/rpc`.
 * It shares the process's services with the API handlers — the caller hands over the handlers
 * layer built over the runtime's service context — but it answers the rpc codec, not the API
 * envelope, and OpenAPI does not describe it.
 *
 * The web handler is built once per app: the layer below composes the rpc server with its
 * handlers and codec, and building it forks the server fiber inside the build scope. Request
 * scopes (Scope, HttpServerRequest) stay per request, provided by the handler itself.
 *
 * `ServicesServer<Rpcs>` — the served procedures' decoding and encoding services — is an
 * unresolved conditional on a generic group (the vendor test uses a concrete one), so the
 * compiler cannot see that the composition closes it. The assertions in this file name the
 * channels the layers actually close; the runtime behaviour is exactly the vendor test's.
 */
export const rpcRoutes = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  handlers: Layer.Layer<Rpc.ToHandler<Rpcs>>
): H3Plugin => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, effecttsgo/unsafe-effect-type-assertion
  const handlerLayer = Layer.effect(
    RpcHandler,
    Effect.gen(function* () {
      const httpEffect: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest | Scope.Scope
      > = yield* RpcServer.toHttpEffect(group)
      return { handle: HttpEffect.toWebHandler(httpEffect) }
    })
  ).pipe(
    Layer.provide(Layer.mergeAll(handlers, RpcSerialization.layerNdjson))
  ) as Layer.Layer<RpcHandler>

  return (app: H3) => {
    // The scope lives as long as the app: the rpc server fiber forked by `toHttpEffect` serves
    // every request through the built handler.
    let handle: ((request: Request) => Promise<Response>) | undefined
    const scopePromise = Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        const services = yield* Layer.build(handlerLayer).pipe(
          Effect.provideService(Scope.Scope, scope)
        )
        return { scope, handle: Context.getUnsafe(services, RpcHandler).handle }
      })
    )

    app.post('/rpc', async (event: H3Event) => {
      const { handle: built } = await scopePromise
      handle = built
      return handle(event.req)
    })
  }
}
