export interface Received {
  readonly path: string
  readonly headers: Record<string, string>
  /** The JSON body of an OTLP/HTTP export. */
  readonly body: any
}

export interface FakeCollector {
  readonly url: string
  readonly received: Received[]
  /** Hand this to `makeTestApp({ fetch })`: the exporters will post here. */
  readonly fetch: typeof globalThis.fetch
}

/**
 * An in-process OTLP/HTTP collector. Its `fetch` records what the exporters post and always
 * answers 200. It reaches the exporters through Effect's `FetchHttpClient.Fetch` reference: no
 * port opens, and no global is replaced, because Effect caches the default `fetch` and a stub
 * would leak into the next test.
 */
export const startCollector = (): FakeCollector => {
  const url = 'http://collector.test'
  const received: Received[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(input instanceof Request ? input.url : String(input))

    const raw = input instanceof Request ? await input.text() : init?.body
    const text =
      typeof raw === 'string' ? raw : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : ''
    received.push({
      path: target.pathname,
      headers: Object.fromEntries(
        new Headers(input instanceof Request ? input.headers : init?.headers).entries()
      ),
      body: text === '' ? null : JSON.parse(text)
    })
    return new Response('{"partialSuccess":{}}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  return { url, received, fetch }
}

/** Every span the collector has received, flattened out of the OTLP envelope. */
export const spansOf = (collector: FakeCollector): any[] =>
  collector.received
    .filter((entry) => entry.path === '/v1/traces')
    .flatMap((entry) => entry.body.resourceSpans)
    .flatMap((resource: any) => resource.scopeSpans)
    .flatMap((scope: any) => scope.spans)

/** The value of a span attribute, whichever OTLP value type carries it. */
export const attributeOf = (span: any, key: string): unknown => {
  const found = (span.attributes as any[]).find((attribute) => attribute.key === key)
  if (found === undefined) return undefined
  const value = found.value
  return value.stringValue ?? value.intValue ?? value.boolValue ?? value.doubleValue
}
