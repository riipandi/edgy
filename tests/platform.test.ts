import { describe, expect, it } from '@effect/vitest'
import { OUT_DIR, platformOf } from '../builder/platform.ts'

describe('platformOf', () => {
  it('is the Worker only for --mode worker', () => {
    expect(platformOf({ mode: 'worker' })).toBe('worker')
  })

  it('is the Node server for every other mode, so the defaults need no flag', () => {
    for (const mode of ['development', 'production', 'node', 'test', 'staging']) {
      expect(platformOf({ mode })).toBe('node')
    }
  })

  it('writes each platform to its own directory', () => {
    expect(OUT_DIR).toEqual({ node: 'dist/server', worker: 'dist/worker' })
  })
})
