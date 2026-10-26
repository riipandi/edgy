import { it } from '@effect/vitest'
import { Schema } from 'effect'
import { expect } from 'vite-plus/test'
import { decodeCursor, encodeCursor, PaginationFields } from './pagination.ts'

it('round-trips a cursor payload through the opaque token', () => {
  const token = encodeCursor({ id: 'user_01abc', sort_value: '2026-10-26' })
  expect(decodeCursor<{ id: string; sort_value: string }>(token)).toEqual({
    id: 'user_01abc',
    sort_value: '2026-10-26'
  })
})

it('decodeCursor returns undefined for a token that is not valid JSON', () => {
  expect(decodeCursor('not-a-real-cursor')).toBeUndefined()
})

const Query = Schema.Struct(PaginationFields)

it('PaginationFields accepts an in-range limit and rejects an out-of-range one', () => {
  expect(Schema.decodeUnknownSync(Query)({ limit: '20' })).toEqual({ limit: 20 })
  expect(() => Schema.decodeUnknownSync(Query)({ limit: '0' })).toThrow()
  expect(() => Schema.decodeUnknownSync(Query)({ limit: '101' })).toThrow()
  expect(() => Schema.decodeUnknownSync(Query)({ limit: '1.5' })).toThrow()
})

it('PaginationFields leaves every field optional', () => {
  expect(Schema.decodeUnknownSync(Query)({})).toEqual({})
})
