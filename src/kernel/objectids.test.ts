import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { TypeID } from 'typeid-js'
import { defineId } from './objectids.ts'

describe('defineId', () => {
  const widget = defineId('widget')

  it('mints ids with its prefix and a valid suffix', () => {
    const id = widget.make()
    expect(id.startsWith('widget_')).toBe(true)
    expect(Schema.is(widget.schema)(id)).toBe(true)
    expect(() => TypeID.fromString(id, 'widget')).not.toThrow()
  })

  it('sorts by creation time', async () => {
    const first = widget.make()
    await new Promise((resolve) => setTimeout(resolve, 3))
    expect(widget.make() > first).toBe(true)
  })

  it('accepts an id of its own kind only', () => {
    const is = Schema.is(widget.schema)
    const other = defineId('gadget')
    expect(is(other.make())).toBe(false)
  })

  it('refuses text that is not a TypeID', () => {
    const is = Schema.is(widget.schema)
    for (const bad of ['', '42', 'widget_', 'widget_xyz', 'WIDGET_01h2xcejqtf2nbrexx3vqjhp41']) {
      expect(is(bad)).toBe(false)
    }
    // 26 characters carry 128 bits, so the first cannot be above 7; and there is no i, l, o or u
    expect(is('widget_81h2xcejqtf2nbrexx3vqjhp41')).toBe(false)
    expect(is('widget_01h2xcejqtf2nbrexx3vqjhp4u')).toBe(false)
  })

  it('refuses a prefix that is taken or malformed', () => {
    expect(() => defineId('widget')).toThrow(/already in use/)
    for (const bad of ['', 'Upper', '1abc', 'a-b', '_a', 'a_']) {
      expect(() => defineId(bad)).toThrow(/Invalid id prefix/)
    }
  })
})
