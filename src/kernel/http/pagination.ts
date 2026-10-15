import { Schema } from 'effect'
import { ALL_RECORDS, DEFAULT_LIMIT, MAX_LIMIT } from '../pagination.ts'
import type { PageRequest, PageSummary, SortOrder } from '../pagination.ts'

/** Pagination metadata of a success response (snake_case: it is the wire contract). */
export interface ApiPagination {
  readonly page: number | null
  readonly limit: number | null
  readonly total_pages: number | null
  readonly total_items: number | null
  readonly first_item_index: number | null
  readonly last_item_index: number | null
}

/** Link relations (`self`, `next`, `prev`, `first`, `last`) to URLs; `null` when there is none. */
export type ApiLinks = Readonly<Record<string, string | null>>

/** Decoded `paginationQuery` input. */
export interface PaginationQuery<S extends string> {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly sort_by?: S | undefined
  readonly sort_order?: SortOrder | undefined
}

const positiveOrAll = (what: string, max: number, allowAll: boolean) =>
  Schema.FiniteFromString.pipe(
    Schema.check(
      Schema.makeFilter((n: number) =>
        (allowAll && n === ALL_RECORDS) || (Number.isSafeInteger(n) && n >= 1 && n <= max)
          ? undefined
          : `${what} must be an integer from 1 to ${max}${allowAll ? `, or ${ALL_RECORDS} for all records` : ''}`
      )
    )
  )

/**
 * Query schema for a collection endpoint. `sortable` is the column allow-list, so `sort_by` is
 * typed as a union of those columns. `limit` is capped at `MAX_LIMIT`.
 *
 * `-1` for `page` or `limit` (every record in one page) is refused unless `allowAll` is set: it
 * lets any caller read a whole table at once, which only a bounded, trusted table should offer.
 * Defaults are applied by `toPageRequest`, so this schema decodes exactly what was sent.
 */
export const paginationQuery = <const S extends readonly [string, ...string[]]>(
  sortable: S,
  options: { readonly allowAll?: boolean } = {}
) =>
  Schema.Struct({
    page: Schema.optional(
      positiveOrAll('page', Number.MAX_SAFE_INTEGER, options.allowAll === true)
    ),
    limit: Schema.optional(positiveOrAll('limit', MAX_LIMIT, options.allowAll === true)),
    sort_by: Schema.optional(Schema.Literals(sortable)),
    sort_order: Schema.optional(Schema.Literals(['asc', 'desc']))
  })

/** Applies defaults and normalises "all records" into the request a repository consumes. */
export const toPageRequest = <S extends string>(
  query: PaginationQuery<S>,
  defaults: { readonly sortBy: S; readonly sortOrder?: SortOrder }
): PageRequest<S> => {
  const all = query.page === ALL_RECORDS || query.limit === ALL_RECORDS
  const limit = all ? null : (query.limit ?? DEFAULT_LIMIT)
  const page = all ? 1 : (query.page ?? 1)

  return {
    page,
    limit,
    offset: limit === null ? 0 : (page - 1) * limit,
    sortBy: query.sort_by ?? defaults.sortBy,
    sortOrder: query.sort_order ?? defaults.sortOrder ?? 'asc'
  }
}

/**
 * Page metadata for the response. Item indexes are 1-based and inclusive, and `null` past the end.
 * All records report one page and a `null` limit.
 */
export const paginationMeta = ({ page, limit, total }: PageSummary): ApiPagination => {
  const totalPages = limit === null ? 1 : Math.max(1, Math.ceil(total / limit))
  const first = limit === null ? 1 : (page - 1) * limit + 1
  const last = limit === null ? total : Math.min(page * limit, total)
  const empty = first > total

  return {
    page,
    limit,
    total_pages: totalPages,
    total_items: total,
    first_item_index: empty ? null : first,
    last_item_index: empty ? null : last
  }
}

/**
 * Builds `self`, `first`, `prev`, `next` and `last` as relative URLs that keep the other query
 * parameters. Relative on purpose: behind a proxy the origin is not ours to know.
 */
export const paginationLinks = (url: URL, meta: ApiPagination): ApiLinks => {
  const self = `${url.pathname}${url.search}`
  if (meta.limit === null || meta.page === null || meta.total_pages === null) return { self }

  const { page, total_pages: lastPage } = meta
  const to = (target: number) => {
    const params = new URLSearchParams(url.searchParams)
    params.set('page', String(target))
    return `${url.pathname}?${params.toString()}`
  }

  return {
    self,
    first: to(1),
    prev: page > 1 ? to(Math.min(page - 1, lastPage)) : null,
    next: page < lastPage ? to(page + 1) : null,
    last: to(lastPage)
  }
}
