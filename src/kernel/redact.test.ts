import { describe, expect, it } from '@effect/vitest'
import { Redacted } from 'effect'
import { describeFailure, isSensitiveName, REDACTED, redactText, redactValue } from './redact.ts'

describe('redactText', () => {
  it('removes the password of a connection string and keeps the rest', () => {
    expect(redactText('connect ECONNREFUSED redis://:securedb@localhost:6379')).toBe(
      `connect ECONNREFUSED redis://:${REDACTED}@localhost:6379`
    )
    expect(redactText('postgres://app:hunter2@db.internal/app failed')).toBe(
      `postgres://app:${REDACTED}@db.internal/app failed`
    )
  })

  it('removes bearer and basic credentials and JWTs', () => {
    expect(redactText('Authorization: Bearer abcdef1234567890')).toBe(`Authorization: ${REDACTED}`)
    expect(redactText('sent Basic dXNlcjpwYXNz')).toBe(`sent Basic ${REDACTED}`)
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'
    expect(redactText(`token was ${jwt} ok`)).not.toContain('eyJ')
  })

  it('removes the value of a sensitive name in each common spelling', () => {
    expect(redactText('password=hunter2 user=ada')).toBe(`password=${REDACTED} user=ada`)
    expect(redactText('{"api_key":"abc123","email":"a@b.io"}')).toBe(
      `{"api_key":"${REDACTED}","email":"a@b.io"}`
    )
    expect(redactText("DB_PASSWORD: 'p@ss w0rd'")).toBe(`DB_PASSWORD: '${REDACTED}'`)
    expect(redactText('x-api-key: k-123 and cookie=sid=abc')).not.toMatch(/k-123|sid=abc/)
  })

  it('removes command-line flag values and values after a fullwidth colon', () => {
    expect(redactText('spawn mysql --password hunter2 --host db')).toBe(
      `spawn mysql --password ${REDACTED} --host db`
    )
    expect(redactText('run --api-key=abc123 now')).toBe(`run --api-key=${REDACTED} now`)
    expect(redactText('password：hunter2')).toBe(`password：${REDACTED}`)
  })

  it('stays linear on adversarial text: long runs of keyword-like characters', () => {
    const attacks = [
      'a'.repeat(100_000),
      'password'.repeat(12_500),
      '-'.repeat(100_000),
      'token_'.repeat(16_000),
      `${'x'.repeat(50_000)}=`.repeat(2),
      'a://'.repeat(25_000)
    ]
    const started = performance.now()
    for (const attack of attacks) redactText(attack)
    // quadratic matching took tens of seconds on the first of these
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('cuts text past the cap instead of scanning it', () => {
    const out = redactText(`${'x'.repeat(20_000)} password=hunter2`)
    expect(out.length).toBeLessThan(17_000)
    expect(out.endsWith('…[truncated]')).toBe(true)
  })

  it('leaves ordinary diagnostics alone', () => {
    for (const text of [
      'SQLITE_ERROR: no such table: users',
      'UNIQUE constraint failed: users.email',
      'D1_ERROR: Network connection lost',
      'request req_01m50b2svefztswkmtt2hg8na3 failed after 3ms',
      'passenger count must be positive'
    ]) {
      expect(redactText(text)).toBe(text)
    }
  })
})

describe('redactValue', () => {
  it('redacts by key at any depth, and inside strings', () => {
    expect(
      redactValue({
        email: 'a@b.io',
        auth: { token: 'abc', note: 'password=x' },
        list: [{ secret: 1 }, 'redis://:pw@h']
      })
    ).toEqual({
      email: 'a@b.io',
      auth: REDACTED,
      list: [{ secret: REDACTED }, `redis://:${REDACTED}@h`]
    })
  })

  it('hides Redacted values and reduces an Error to its name and message', () => {
    expect(redactValue(Redacted.make('s3cret'))).toBe(REDACTED)
    expect(redactValue(new TypeError('bad password=abc'))).toEqual({
      name: 'TypeError',
      message: `bad password=${REDACTED}`
    })
  })

  it('stops at a bounded depth instead of following a cycle', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(() => redactValue(cycle)).not.toThrow()
  })
})

describe('isSensitiveName', () => {
  it('matches a secret as a word of the name only', () => {
    for (const name of ['password', 'db_password', 'x-api-key', 'refreshToken', 'Authorization']) {
      expect(isSensitiveName(name)).toBe(true)
    }
    for (const name of ['email', 'passenger', 'tokenizer_count', 'name']) {
      expect(isSensitiveName(name)).toBe(false)
    }
  })
})

describe('describeFailure', () => {
  it('says what went wrong, redacted, or nothing', () => {
    expect(describeFailure(new Error('boom password=x'))).toBe(`boom password=${REDACTED}`)
    expect(describeFailure({ message: 'plain' })).toBe('plain')
    expect(describeFailure(undefined)).toBe('')
    expect(describeFailure(42)).toBe('')
  })
})
