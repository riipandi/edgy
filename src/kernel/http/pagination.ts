import { Schema, SchemaTransformation } from 'effect'
import {
  DEFAULT_LIMIT,
  decodeCursor,
  MAX_CURSOR_LENGTH,
  MAX_LIMIT,
  type PageRequest,
  type PageSummary,
  type SortOrder
} from '../pagination.ts'

/**
 * Pagination metadata of a success response (snake_case: it is the wire contract). There is no
 * total: counting every row on each request does not scale, and a cursor does not need one.
 */
export interface ApiPagination {
  readonly limit: number
  /** Whether a page follows this one. */
  readonly has_more: boolean
  /** Opaque; pass it as `cursor` for the next page. `null` on the last page. */
  readonly next_cursor: string | null
}

/** Link relations (`self`, `first`, `next`) to URLs; `null` when there is none. */
export type ApiLinks = Readonly<Record<string, string | null>>

/** Decoded `paginationQuery` input. */
export interface PaginationQuery<S extends string> {
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
  readonly sort_by?: S | undefined
  readonly sort_order?: SortOrder | undefined
}

const LIMIT_MESSAGE = `limit must be an integer from 1 to ${MAX_LIMIT}`

/** Plain digits only: `Number('1e2')` is 100, but the text is not an integer the caller wrote. */
const limitSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((text: string) => (/^\d{1,3}$/.test(text) ? undefined : LIMIT_MESSAGE))
  ),
  Schema.decodeTo(Schema.Finite, SchemaTransformation.numberFromString),
  Schema.check(
    Schema.makeFilter((n: number) => (n >= 1 && n <= MAX_LIMIT ? undefined : LIMIT_MESSAGE))
  )
).annotate({
  description: `Items per page: an integer from 1 to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`
})

const cursorSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((text: string) =>
      text.length <= MAX_CURSOR_LENGTH && decodeCursor(text) !== undefined
        ? undefined
        : 'cursor is not valid'
    )
  )
)

/**
 * Query schema for a collection endpoint: `limit`, `cursor`, `sort_by`, `sort_order`. `sortable`
 * is the column allow-list, so `sort_by` is typed as a union of those columns, and `defaults` is
 * the sort used when none is sent. A cursor belongs to the sort it was issued for: sending it
 * with another is refused, since it would point into a different order. Defaults for `limit`
 * are applied by `toPageRequest`, so this schema decodes exactly what was sent.
 */
export const paginationQuery = <const S extends readonly [string, ...string[]]>(
  sortable: S,
  defaults: { readonly sortBy: S[number]; readonly sortOrder?: SortOrder }
) =>
  Schema.Struct({
    limit: Schema.optional(limitSchema).annotateKey({
      description: `Items per page: an integer from 1 to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`
    }),
    cursor: Schema.optional(cursorSchema).annotateKey({
      description:
        'Where the next page starts. Copy `next_cursor` from the previous page; it belongs to the sort it was issued for.'
    }),
    sort_by: Schema.optional(Schema.Literals(sortable)).annotateKey({
      description: `Column to sort by. Default \`${defaults.sortBy}\`.`
    }),
    sort_order: Schema.optional(Schema.Literals(['asc', 'desc'])).annotateKey({
      description: `Sort direction. Default \`${defaults.sortOrder ?? 'asc'}\`.`
    })
  }).pipe(
    Schema.check(
      Schema.makeFilter((query) => {
        const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
        if (cursor === undefined) return undefined
        const sortBy = query.sort_by ?? defaults.sortBy
        const sortOrder = query.sort_order ?? defaults.sortOrder ?? 'asc'
        return cursor.sortBy === sortBy && cursor.sortOrder === sortOrder
          ? undefined
          : 'cursor was issued for another sort order: follow links.next, or drop the cursor'
      })
    )
  )

/** Applies defaults and turns the cursor into the request a repository consumes. */
export const toPageRequest = <S extends string>(
  query: PaginationQuery<S>,
  defaults: { readonly sortBy: S; readonly sortOrder?: SortOrder }
): PageRequest<S> => {
  const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
  return {
    limit: query.limit ?? DEFAULT_LIMIT,
    after: cursor === undefined ? undefined : { value: cursor.value, id: cursor.id },
    sortBy: query.sort_by ?? defaults.sortBy,
    sortOrder: query.sort_order ?? defaults.sortOrder ?? 'asc'
  }
}

/** Page metadata for the response. */
export const paginationMeta = ({ limit, next }: PageSummary): ApiPagination => ({
  limit,
  has_more: next !== null,
  next_cursor: next
})

/**
 * Builds `self`, `first` and `next` as relative URLs that keep the other query parameters, so
 * following `next` repeats the same sort and limit. Relative on purpose: behind a proxy the
 * origin is not ours to know.
 */
export const paginationLinks = (url: URL, meta: ApiPagination): ApiLinks => {
  const to = (cursor: string | null) => {
    const params = new URLSearchParams(url.searchParams)
    if (cursor === null) params.delete('cursor')
    else params.set('cursor', cursor)
    const query = params.toString()
    return query === '' ? url.pathname : `${url.pathname}?${query}`
  }
  return {
    self: `${url.pathname}${url.search}`,
    first: to(null),
    next: meta.next_cursor === null ? null : to(meta.next_cursor)
  }
}
