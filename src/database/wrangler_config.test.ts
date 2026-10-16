import { describe, expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { parseJsonc, withRemoteD1 } from './wrangler_config.ts'

describe('parseJsonc', () => {
  it('reads comments and trailing commas, and leaves strings alone', () => {
    const text = `{
      // a line comment
      "url": "https://example.com/a//b", /* a block
      comment */
      "list": [1, 2, 3,],
      "nested": { "k": "v", },
      "quote": "say \\"hi\\" // not a comment",
    }`
    expect(parseJsonc(text)).toEqual({
      url: 'https://example.com/a//b',
      list: [1, 2, 3],
      nested: { k: 'v' },
      quote: 'say "hi" // not a comment'
    })
  })

  it('reads the project’s own wrangler.jsonc', () => {
    const config = parseJsonc(
      readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
    )
    expect(config).toMatchObject({ d1_databases: [{ binding: 'DB' }] })
  })

  it('refuses text that is not JSON once the comments are gone', () => {
    expect(() => parseJsonc('{ nope }')).toThrow(/JSON/)
  })
})

describe('withRemoteD1', () => {
  const real = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')

  it('marks only the named binding remote, and keeps everything else', () => {
    const config = JSON.parse(withRemoteD1(real, 'DB'))
    expect(config.d1_databases[0]).toMatchObject({ binding: 'DB', remote: true })
    const original = parseJsonc(real) as { name: string; ratelimits: unknown; vars: unknown }
    expect(config.name).toBe(original.name)
    expect(config.ratelimits).toEqual(original.ratelimits)
    expect(config.vars).toEqual(original.vars)
  })

  it('leaves the other D1 bindings local', () => {
    const two = JSON.stringify({
      d1_databases: [
        { binding: 'A', database_id: '1' },
        { binding: 'B', database_id: '2' }
      ]
    })
    const config = JSON.parse(withRemoteD1(two, 'B'))
    expect(config.d1_databases[0]).not.toHaveProperty('remote')
    expect(config.d1_databases[1].remote).toBe(true)
  })

  it('names the binding it could not find, before any network is touched', () => {
    expect(() => withRemoteD1(real, 'NOPE')).toThrow(/No D1 binding named "NOPE"/)
    expect(() => withRemoteD1('{}', 'DB')).toThrow(/No D1 binding named "DB"/)
    expect(() => withRemoteD1('[]', 'DB')).toThrow(/not an object/)
  })
})
