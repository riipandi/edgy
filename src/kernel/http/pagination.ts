import { Schema } from 'effect'
import {
  ALL_RECORDS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type PageRequest,
  type PageSummary,
  type SortOrder
} from '../pagination.ts'

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

/** Decoded `PaginationParams`; see {@link paginationQuery}. */
export interface PaginationQuery<S extends string> {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly sort_by?: S | undefined
  readonly sort_order?: SortOrder | undefined
}

const positiveOrAll = (what: string, max: number) =>
  Schema.FiniteFromString.pipe(
    Schema.check(
      Schema.makeFilter((n: number) =>
        n === ALL_RECORDS || (Number.isSafeInteger(n) && n >= 1 && n <= max)
          ? undefined
          : `${what} must be an integer from 1 to ${max}, or ${ALL_RECORDS} for all records`
      )
    )
  )

/**
 * Query schema for a collection endpoint: `page`, `limit`, `sort_by`,
 * `sort_order`. `sortable` is the allow-list of columns, so `sort_by` is
 * validated here and typed as a union of them downstream — it can never be an
 * arbitrary column name.
 *
 * `-1` for `page` or `limit` asks for every record; any other `limit` is
 * capped at `MAX_LIMIT`. Defaults are applied by {@link toPageRequest}, not
 * here, so the schema decodes exactly what the caller sent.
 */
export const paginationQuery = <const S extends readonly [string, ...string[]]>(sortable: S) =>
  Schema.Struct({
    page: Schema.optional(positiveOrAll('page', Number.MAX_SAFE_INTEGER)),
    limit: Schema.optional(positiveOrAll('limit', MAX_LIMIT)),
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
 * Describes a page for the response metadata. Item indexes are 1-based and
 * inclusive; they are `null` for a page past the end. A request for all records
 * reports one page and a `null` limit.
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
 * Builds `self`/`first`/`prev`/`next`/`last` as relative URLs that keep every
 * other query parameter (sort, filters). Relative on purpose: behind a proxy
 * the origin is not ours to know. An all-records response has no other pages,
 * so it only links to itself.
 */
export const paginationLinks = (url: URL, meta: ApiPagination): ApiLinks => {
  const self = `${url.pathname}${url.search}`
  if (meta.limit === null || meta.page === null || meta.total_pages === null) return { self }

  const { page, total_pages: lastPage } = meta
  const to = (target: number) => {
    const params = new URLSearchParams(url.searchParams)
    params.set('page', String(target))
    return `${url.pathname}?${params}`
  }

  return {
    self,
    first: to(1),
    prev: page > 1 ? to(Math.min(page - 1, lastPage)) : null,
    next: page < lastPage ? to(page + 1) : null,
    last: to(lastPage)
  }
}
