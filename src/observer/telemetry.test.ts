import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { attributeOf, type FakeCollector, spansOf, startCollector } from '../../tests/collector.ts'
import { parseOtlpHeaders } from './telemetry.ts'

describe('parseOtlpHeaders', () => {
  it('reads key=value pairs separated by commas, lower-casing the names', () => {
    expect(parseOtlpHeaders('Authorization=abc123, X-Team=blue')).toEqual({
      authorization: 'abc123',
      'x-team': 'blue'
    })
  })

  it('keeps an = inside the value, decodes percent-encoding, skips entries without a key', () => {
    expect(parseOtlpHeaders('authorization=Bearer%20a=b==,=nokey,garbage,x=1')).toEqual({
      authorization: 'Bearer a=b==',
      x: '1'
    })
  })

  it('is empty for an empty string', () => {
    expect(parseOtlpHeaders('')).toEqual({})
  })
})

describe('exported telemetry', () => {
  let collector: FakeCollector
  let t: TestApp | undefined

  beforeEach(() => {
    collector = startCollector()
  })
  afterEach(async () => {
    await t?.dispose() // closing the runtime flushes every exporter
    t = undefined
  })

  const start = (env: Record<string, string> = {}) =>
    makeTestApp(
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
        OTEL_EXPORTER_OTLP_HEADERS: 'authorization=dev-key',
        OTEL_EXPORTER_OTLP_COMPRESSION: 'none',
        OTEL_SDK_DISABLED: 'false',
        OTEL_EXPORT_INTERVAL: '100',
        ...env
      },
      { fetch: collector.fetch }
    )

  const flushed = async () => {
    await t?.dispose()
    t = undefined
  }

  it('records a server span named after the route, with the response status', async () => {
    t = await start()
    await t.request('/api/users/42')
    await flushed()

    const span = spansOf(collector).find((entry) => entry.name === 'GET /api/users/:id')
    expect(span).toBeDefined()
    expect(span.kind).toBe(2) // SERVER
    expect(attributeOf(span, 'http.route')).toBe('/api/users/:id')
    expect(attributeOf(span, 'url.path')).toBe('/api/users/42')
    expect(attributeOf(span, 'http.response.status_code')).toBe(404)
  })

  it('does not mark a client error as a failed server span', async () => {
    t = await start()
    await t.request('/api/users/42') // 404
    await flushed()

    const span = spansOf(collector).find((entry) => entry.name === 'GET /api/users/:id')
    // OTLP status code 2 is ERROR; a 404 is an answer, not a server fault.
    expect(span.status?.code ?? 0).not.toBe(2)
  })

  it('sends the configured headers and the service resource', async () => {
    t = await start({ OTEL_SERVICE_NAME: 'edgy-test' })
    await t.request('/api/users')
    await flushed()

    const trace = collector.received.find((entry) => entry.path === '/v1/traces')
    expect(trace?.headers.authorization).toBe('dev-key')
    const resource = trace?.body.resourceSpans[0].resource.attributes as any[]
    expect(resource.find((a) => a.key === 'service.name').value.stringValue).toBe('edgy-test')
    expect(resource.some((a) => a.key === 'service.instance.id')).toBe(true)
  })

  it('exports metrics too', async () => {
    t = await start()
    await t.request('/health')
    await flushed()

    const metrics = collector.received.filter((entry) => entry.path === '/v1/metrics')
    expect(JSON.stringify(metrics.map((entry) => entry.body))).toContain('http_requests_total')
  })

  it("continues the caller's trace and returns its id as trace_id", async () => {
    t = await start()
    const traceId = '0af7651916cd43dd8448eb211c80319c'
    const response = await t.request('/api/users', {
      headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` }
    })
    const body: any = await response.json()
    await flushed()

    expect(body.metadata.trace_id).toBe(traceId)
    const span = spansOf(collector).find((entry) => entry.name === 'GET /api/users')
    expect(span.traceId).toBe(traceId)
    expect(span.parentSpanId).toBe('b7ad6b7169203331')
  })

  it('gives a fresh trace to a request with no traceparent', async () => {
    t = await start()
    const body: any = await (await t.request('/api/users')).json()
    await flushed()

    expect(body.metadata.trace_id).toMatch(/^[0-9a-f]{32}$/)
    expect(spansOf(collector).some((span) => span.traceId === body.metadata.trace_id)).toBe(true)
  })

  it('records nothing and returns no trace_id when the sample ratio is 0', async () => {
    t = await start({ OTEL_TRACES_SAMPLE_RATIO: '0' })
    const body: any = await (await t.request('/api/users')).json()
    await flushed()

    expect(body.metadata).not.toHaveProperty('trace_id')
    expect(spansOf(collector).filter((span) => span.name === 'GET /api/users')).toEqual([])
  })

  it("still honours a caller's sampled trace at ratio 0", async () => {
    t = await start({ OTEL_TRACES_SAMPLE_RATIO: '0' })
    const traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await t.request('/api/users', { headers: { traceparent: `00-${traceId}-bbbbbbbbbbbbbbbb-01` } })
    await flushed()

    expect(spansOf(collector).some((span) => span.traceId === traceId)).toBe(true)
  })
})

describe('probe traces', () => {
  it('does not record a trace for /health, but still records an ordinary request', async () => {
    const collector = startCollector()
    const t = await makeTestApp(
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
        OTEL_SDK_DISABLED: 'false',
        OTEL_EXPORTER_OTLP_COMPRESSION: 'none',
        OTEL_EXPORT_INTERVAL: '100'
      },
      { fetch: collector.fetch }
    )
    await t.request('/health')
    await t.request('/api/users')
    await t.dispose()

    const names = spansOf(collector).map((span) => span.name)
    expect(names).toContain('GET /api/users')
    expect(names).not.toContain('GET /health')
  })

  it("still continues a caller's sampled trace on /health", async () => {
    const collector = startCollector()
    const t = await makeTestApp(
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
        OTEL_SDK_DISABLED: 'false',
        OTEL_EXPORTER_OTLP_COMPRESSION: 'none',
        OTEL_EXPORT_INTERVAL: '100'
      },
      { fetch: collector.fetch }
    )
    const traceId = 'cccccccccccccccccccccccccccccccc'
    await t.request('/health', { headers: { traceparent: `00-${traceId}-dddddddddddddddd-01` } })
    await t.dispose()

    expect(spansOf(collector).some((span) => span.traceId === traceId)).toBe(true)
  })
})

describe('with no collector configured', () => {
  it('returns no trace_id and exports nothing', async () => {
    const t = await makeTestApp()
    const body: any = await (await t.request('/api/users')).json()
    await t.dispose()

    expect(body.metadata).not.toHaveProperty('trace_id')
  })
})
