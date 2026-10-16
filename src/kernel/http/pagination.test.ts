import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { decodeCursor, encodeCursor, makePage, MAX_CURSOR_LENGTH } from '../pagination.ts'
import { paginationLinks, paginationMeta, paginationQuery, toPageRequest } from './pagination.ts'

const cursorFor = (
  sortBy: string,
  value: string | number,
  id: string,
  sortOrder: 'asc' | 'desc' = 'asc'
) => encodeCursor({ sortBy, sortOrder, value, id })

describe('cursor', () => {
  it('round-trips a sort value and an id, unicode included', () => {
    for (const value of ['plain', 'Zoë "quoted" 日本語', 42, '']) {
      const text = cursorFor('name', value, 'user_1')
      expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodeCursor(text)).toEqual({
        sortBy: 'name',
        sortOrder: 'asc',
        value,
        id: 'user_1'
      })
    }
  })

  it.each([
    '',
    'not a cursor',
    '!!!!',
    btoa('{"s":"id"}'),
    btoa('[]'),
    btoa('null'),
    btoa('{"s":1,"o":"asc","v":"x","i":"y"}'),
    btoa('{"s":"id","o":"sideways","v":"x","i":"y"}'),
    btoa('{"s":"id","o":"asc","v":null,"i":"y"}'),
    btoa('{"s":"id","o":"asc","v":"x","i":7}'),
    'A'.repeat(MAX_CURSOR_LENGTH + 1)
  ])('refuses %j', (text) => {
    expect(decodeCursor(text)).toBeUndefined()
  })
})

describe('makePage', () => {
  const request = { limit: 2, sortBy: 'name', sortOrder: 'asc' } as const
  const row = (n: number) => ({ id: `user_${n}`, name: `n${n}` })

  it('drops the look-ahead row and points the cursor at the last row kept', () => {
    const page = makePage([row(1), row(2), row(3)], request)
    expect(page.items).toEqual([row(1), row(2)])
    expect(page.limit).toBe(2)
    expect(decodeCursor(page.next!)).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
      value: 'n2',
      id: 'user_2'
    })
  })

  it('has no next page when the rows fit, or when there are none', () => {
    expect(makePage([row(1), row(2)], request).next).toBeNull()
    expect(makePage([], request)).toEqual({ items: [], limit: 2, next: null })
  })
})

describe('toPageRequest', () => {
  it('applies defaults', () => {
    expect(toPageRequest({}, { sortBy: 'id' })).toEqual({
      limit: 20,
      after: undefined,
      sortBy: 'id',
      sortOrder: 'asc'
    })
  })

  it('reads the anchor from the cursor', () => {
    const cursor = cursorFor('id', 'user_7', 'user_7')
    expect(toPageRequest({ cursor, limit: 5 }, { sortBy: 'id' })).toMatchObject({
      limit: 5,
      after: { value: 'user_7', id: 'user_7' }
    })
  })
})

describe('paginationQuery', () => {
  const sortable = ['id', 'name'] as const
  const schema = paginationQuery(sortable, { sortBy: 'id' })
  const ok = (input: unknown) => Schema.decodeUnknownExit(schema)(input)._tag === 'Success'

  it('caps the limit', () => {
    expect(ok({ limit: '100' })).toBe(true)
    expect(ok({ limit: '101' })).toBe(false)
    expect(ok({ limit: '0' })).toBe(false)
    expect(ok({ limit: '-1' })).toBe(false)
    expect(ok({ limit: '1.5' })).toBe(false)
  })

  it('has no page parameter any more', () => {
    expect(Schema.decodeUnknownSync(schema)({ page: '2' })).toEqual({})
  })

  it('accepts only a cursor this module issued', () => {
    expect(ok({ cursor: cursorFor('id', 'user_1', 'user_1') })).toBe(true)
    expect(ok({ cursor: 'garbage' })).toBe(false)
  })

  it('ties a cursor to the sort it was issued for, defaults included', () => {
    const byName = cursorFor('name', 'n', 'user_1')
    expect(ok({ cursor: byName, sort_by: 'name' })).toBe(true)
    expect(ok({ cursor: byName })).toBe(false) // the default sort is id
    expect(ok({ cursor: byName, sort_by: 'name', sort_order: 'desc' })).toBe(false)
    expect(
      ok({ cursor: cursorFor('name', 'n', 'user_1', 'desc'), sort_by: 'name', sort_order: 'desc' })
    ).toBe(true)
    expect(ok({ cursor: cursorFor('id', 'user_1', 'user_1'), sort_by: 'name' })).toBe(false)
  })
})

describe('paginationMeta', () => {
  it('reports the limit, whether more follows, and the cursor', () => {
    expect(paginationMeta({ limit: 10, next: 'abc' })).toEqual({
      limit: 10,
      has_more: true,
      next_cursor: 'abc'
    })
    expect(paginationMeta({ limit: 10, next: null })).toEqual({
      limit: 10,
      has_more: false,
      next_cursor: null
    })
  })
})

describe('paginationLinks', () => {
  const url = new URL('http://x/api/users?limit=10&sort_by=email&cursor=old')

  it('keeps the other parameters and swaps the cursor', () => {
    const links = paginationLinks(url, { limit: 10, has_more: true, next_cursor: 'new' })
    expect(links).toEqual({
      self: '/api/users?limit=10&sort_by=email&cursor=old',
      first: '/api/users?limit=10&sort_by=email',
      next: '/api/users?limit=10&sort_by=email&cursor=new'
    })
  })

  it('has no next on the last page, and a bare path when nothing else is asked', () => {
    const links = paginationLinks(new URL('http://x/users'), {
      limit: 20,
      has_more: false,
      next_cursor: null
    })
    expect(links).toEqual({ self: '/users', first: '/users', next: null })
  })
})
