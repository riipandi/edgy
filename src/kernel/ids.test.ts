import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { randomBytes } from 'node:crypto'
import { TypeID } from 'typeid-js'
import { ID_PREFIX, idSchema, newId, traceHexOf, traceTypeId } from './ids.ts'

describe('newId', () => {
  it('writes the prefix of its kind and a valid suffix', () => {
    for (const kind of Object.keys(ID_PREFIX) as (keyof typeof ID_PREFIX)[]) {
      const id = newId(kind)
      expect(id.startsWith(`${ID_PREFIX[kind]}_`)).toBe(true)
      expect(Schema.is(idSchema(kind))(id)).toBe(true)
      expect(() => TypeID.fromString(id, ID_PREFIX[kind])).not.toThrow()
    }
  })

  it('sorts by creation time', async () => {
    const first = newId('user')
    await new Promise((resolve) => setTimeout(resolve, 3))
    expect(newId('user') > first).toBe(true)
  })
})

describe('idSchema', () => {
  const user = Schema.is(idSchema('user'))

  it('accepts an id of its own kind only', () => {
    expect(user(newId('user'))).toBe(true)
    expect(user(newId('request'))).toBe(false)
  })

  it('refuses text that is not a TypeID', () => {
    for (const bad of ['', '42', 'user_', 'user_xyz', 'USER_01h2xcejqtf2nbrexx3vqjhp41']) {
      expect(user(bad)).toBe(false)
    }
    // a 26-character suffix cannot start above 7 (it would overflow 128 bits), and has no i, l, o, u
    expect(user('user_81h2xcejqtf2nbrexx3vqjhp41')).toBe(false)
    expect(user('user_01h2xcejqtf2nbrexx3vqjhp4u')).toBe(false)
  })
})

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
      expect(Schema.is(idSchema('trace'))(id)).toBe(true)
      expect(traceHexOf(id)).toBe(hex)
    }
  })

  it('refuse to decode something that is not a trace id', () => {
    expect(traceHexOf(newId('user'))).toBeUndefined()
    expect(traceHexOf('trc_nope')).toBeUndefined()
  })
})
