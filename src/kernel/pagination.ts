/** Page size used when the caller does not send `limit`. */
export const DEFAULT_LIMIT = 20

/** Largest `limit` a caller may ask for; `ALL_RECORDS` is the only way past it. */
export const MAX_LIMIT = 100

/** `page` or `limit` value that selects every record in a single page. */
export const ALL_RECORDS = -1

export type SortOrder = 'asc' | 'desc'

/**
 * A resolved page request: defaults applied and the SQL offset computed once. `S` is the union of
 * sortable columns, so a user-supplied `sort_by` never reaches a query unchecked.
 */
export interface PageRequest<S extends string = string> {
  readonly page: number
  /** `null` selects every record; the page is then always `1`. */
  readonly limit: number | null
  readonly offset: number
  readonly sortBy: S
  readonly sortOrder: SortOrder
}

/** One page of a collection plus what is needed to describe the rest of it. */
export interface Page<A> {
  readonly items: ReadonlyArray<A>
  readonly page: number
  readonly limit: number | null
  /** Rows matching the query across every page. */
  readonly total: number
}

/** A `Page` without its items: the response metadata. */
export type PageSummary = Omit<Page<unknown>, 'items'>

export const makePage = <A>(
  items: ReadonlyArray<A>,
  request: PageRequest,
  total: number
): Page<A> => ({
  items,
  page: request.page,
  limit: request.limit,
  total
})
