import { describe, expect, it } from '@effect/vitest'
import { makeFailOpenGate } from './fail_open.ts'

describe('fail-open gate', () => {
  const make = () => makeFailOpenGate({ cooldownMs: 10_000, probeMs: 250 })

  it('lets everything through while the store is healthy', () => {
    const gate = make()
    for (const now of [0, 1, 2]) expect(gate.enter(now)).toEqual({ allowed: true, probe: false })
  })

  it('skips the store for the cooldown after a failure, and announces only the first', () => {
    const gate = make()
    expect(gate.failed(1_000, false)).toBe(true)
    expect(gate.enter(1_001).allowed).toBe(false)
    expect(gate.enter(10_999).allowed).toBe(false)
  })

  it('lets one call probe once the cooldown ends, and holds the others back meanwhile', () => {
    const gate = make()
    gate.failed(1_000, false)

    expect(gate.enter(11_000)).toEqual({ allowed: true, probe: true })
    expect(gate.enter(11_001).allowed).toBe(false)
    expect(gate.enter(11_249).allowed).toBe(false)
  })

  it('is healthy again when the probe succeeds', () => {
    const gate = make()
    gate.failed(1_000, false)
    gate.enter(11_000)
    gate.succeeded()
    expect(gate.enter(11_001)).toEqual({ allowed: true, probe: false })
  })

  it('starts a new cooldown when the probe fails, without announcing it again', () => {
    const gate = make()
    gate.failed(1_000, false)
    const { probe } = gate.enter(11_000)
    expect(gate.failed(11_100, probe)).toBe(false)
    expect(gate.enter(11_200).allowed).toBe(false)
    expect(gate.enter(21_100)).toEqual({ allowed: true, probe: true })
  })
})
