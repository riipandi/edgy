import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { randomBytes } from 'node:crypto'
import { TypeID } from 'typeid-js'
import { TraceId, traceHexOf, traceTypeId } from './trace_id.ts'

describe('trace ids', () => {
  it('encode like typeid-js where that library can', () => {
    const uuid = '01890a5d-ac96-774b-bcce-b302099a8057'
    expect(traceTypeId(uuid.replaceAll('-', ''))).toBe(TypeID.fromUUID('trc', uuid).toString())
  })

  it('round-trip any 128-bit trace id, including the extremes', () => {
    const ids = ['0'.repeat(32), 'f'.repeat(32), '0af7651916cd43dd8448eb211c80319c']
    for (let i = 0; i < 500; i += 1) ids.push(randomBytes(16).toString('hex'))
    for (const hex of ids) {
      const id = traceTypeId(hex)
      expect(Schema.is(TraceId.schema)(id)).toBe(true)
      expect(traceHexOf(id)).toBe(hex)
    }
  })

  it('refuse to decode something that is not a trace id', () => {
    expect(traceHexOf('user_01h2xcejqtf2nbrexx3vqjhp41')).toBeUndefined()
    expect(traceHexOf('trc_nope')).toBeUndefined()
  })
})
