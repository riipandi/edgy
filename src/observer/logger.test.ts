import { describe, expect, it } from 'vitest'
import { renderPretty } from './logger.ts'

const entry = (message: string, annotations: Record<string, unknown>) =>
  ({
    timestamp: '2026-10-15T15:44:18.339Z',
    level: 'INFO',
    message,
    annotations,
    spans: {},
    fiberId: '#1',
    cause: undefined
  }) as Parameters<typeof renderPretty>[0]

describe('renderPretty', () => {
  it('prints the request line once, keeping only what the message does not say', () => {
    const line = renderPretty(
      entry('GET /api/users 200 0.49ms', {
        requestId: 'req_01abc',
        method: 'GET',
        path: '/api/users',
        status: 200,
        durationMs: 0.49
      }),
      false
    )
    expect(line).toBe('15:44:18.339 INFO  GET /api/users 200 0.49ms requestId=req_01abc')
  })

  it('keeps an annotation the message does not contain', () => {
    const line = renderPretty(entry('select "id" from "users"', { durationMs: 0.03 }), false)
    expect(line).toBe('15:44:18.339 INFO  select "id" from "users" durationMs=0.03')
  })

  it('drops a one-character value that is a whole word of the message', () => {
    const line = renderPretty(entry('GET / 200 0.05ms', { path: '/' }), false)
    expect(line).toBe('15:44:18.339 INFO  GET / 200 0.05ms')
  })

  it('does not match a value inside a longer word or number', () => {
    const line = renderPretty(entry('Applied 12 migrations', { count: 1 }), false)
    expect(line).toContain('count=1')
  })
})
