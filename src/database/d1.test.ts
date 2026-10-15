import { describe, expect, it } from '@effect/vitest'
import { isD1Database } from './d1.ts'

describe('isD1Database', () => {
  it('accepts anything with a prepare function, and nothing else', () => {
    expect(isD1Database({ prepare: () => ({}) })).toBe(true)
    expect(isD1Database({ prepare: 'no' })).toBe(false)
    expect(isD1Database({})).toBe(false)
    expect(isD1Database(null)).toBe(false)
    expect(isD1Database('prepare')).toBe(false)
  })
})
