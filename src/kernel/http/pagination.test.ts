import { describe, expect, it } from '@effect/vitest'
import { paginationLinks, paginationMeta, toPageRequest } from './pagination.ts'

describe('toPageRequest', () => {
  it('applies defaults', () => {
    expect(toPageRequest({}, { sortBy: 'id' })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'asc'
    })
  })

  it('computes the offset from page and limit', () => {
    expect(toPageRequest({ page: 3, limit: 10 }, { sortBy: 'id' })).toMatchObject({ offset: 20 })
  })

  it('treats -1 for either parameter as "all records" on page 1', () => {
    for (const query of [{ page: -1 }, { limit: -1 }, { page: 4, limit: -1 }]) {
      expect(toPageRequest(query, { sortBy: 'id' })).toMatchObject({
        page: 1,
        limit: null,
        offset: 0
      })
    }
  })
})

describe('paginationMeta', () => {
  it('counts pages and 1-based inclusive item indexes', () => {
    expect(paginationMeta({ page: 2, limit: 10, total: 25 })).toEqual({
      page: 2,
      limit: 10,
      total_pages: 3,
      total_items: 25,
      first_item_index: 11,
      last_item_index: 20
    })
  })

  it('clamps the last index on a short last page', () => {
    expect(paginationMeta({ page: 3, limit: 10, total: 25 })).toMatchObject({
      first_item_index: 21,
      last_item_index: 25
    })
  })

  it('reports one page and null indexes for an empty collection', () => {
    expect(paginationMeta({ page: 1, limit: 10, total: 0 })).toMatchObject({
      total_pages: 1,
      first_item_index: null,
      last_item_index: null
    })
  })
})

describe('paginationLinks', () => {
  const url = new URL('http://x/api/users?limit=10&sort_by=email&page=2')

  it('keeps other query parameters and nulls the missing ends', () => {
    const middle = paginationLinks(url, paginationMeta({ page: 2, limit: 10, total: 30 }))
    expect(middle.prev).toBe('/api/users?limit=10&sort_by=email&page=1')
    expect(middle.next).toBe('/api/users?limit=10&sort_by=email&page=3')
    expect(middle.last).toBe('/api/users?limit=10&sort_by=email&page=3')

    const only = paginationLinks(url, paginationMeta({ page: 1, limit: 10, total: 5 }))
    expect(only.prev).toBeNull()
    expect(only.next).toBeNull()
  })

  it('points prev at the last real page when the page is past the end', () => {
    const links = paginationLinks(url, paginationMeta({ page: 9, limit: 10, total: 30 }))
    expect(links.prev).toBe('/api/users?limit=10&sort_by=email&page=3')
  })
})
