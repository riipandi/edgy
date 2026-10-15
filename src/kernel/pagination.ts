/** Page size used when the caller does not send `limit`. */
export const DEFAULT_LIMIT = 20

/** Largest `limit` a caller may ask for. */
export const MAX_LIMIT = 100

/** Longest cursor accepted, so a hostile one is refused before it is decoded. */
export const MAX_CURSOR_LENGTH = 512

export type SortOrder = 'asc' | 'desc'

/** Where the next page starts: just after the row with this sort value and id. */
export interface PageAnchor {
  readonly value: string | number
  readonly id: string
}

/**
 * A resolved page request. `S` is the union of sortable columns, so a user-supplied `sort_by` never
 * reaches a query unchecked. With no `after` it is the first page.
 */
export interface PageRequest<S extends string = string> {
  readonly limit: number
  readonly after?: PageAnchor | undefined
  readonly sortBy: S
  readonly sortOrder: SortOrder
}

/** One page of a collection. `next` is the opaque cursor of the page after it, `null` at the end. */
export interface Page<A> {
  readonly items: ReadonlyArray<A>
  readonly limit: number
  readonly next: string | null
}

/** A `Page` without its items: the response metadata. */
export type PageSummary = Omit<Page<unknown>, 'items'>

/** What a cursor carries: the sort it belongs to and the row it follows. */
interface CursorPayload {
  readonly s: string
  readonly o: SortOrder
  readonly v: string | number
  readonly i: string
}

/** A cursor decoded, with the sort it was issued for. */
export interface Cursor extends PageAnchor {
  readonly sortBy: string
  readonly sortOrder: SortOrder
}

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const fromBase64Url = (value: string): string => {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0))
  )
}

/**
 * The cursor of the page after `last`. It is opaque to clients but not secret: it holds a sort
 * value and an id, and only ever reaches a query as bound parameters.
 */
export const encodeCursor = (cursor: Cursor): string =>
  toBase64Url(
    JSON.stringify({
      s: cursor.sortBy,
      o: cursor.sortOrder,
      v: cursor.value,
      i: cursor.id
    } satisfies CursorPayload)
  )

/** The cursor a string encodes, or `undefined` when it is not one this module issued. */
export const decodeCursor = (text: string): Cursor | undefined => {
  if (text.length === 0 || text.length > MAX_CURSOR_LENGTH) return undefined
  try {
    const raw: unknown = JSON.parse(fromBase64Url(text))
    if (typeof raw !== 'object' || raw === null) return undefined
    const s: unknown = 's' in raw ? raw.s : undefined
    const o: unknown = 'o' in raw ? raw.o : undefined
    const v: unknown = 'v' in raw ? raw.v : undefined
    const i: unknown = 'i' in raw ? raw.i : undefined
    if (typeof s !== 'string' || (o !== 'asc' && o !== 'desc')) return undefined
    if (typeof i !== 'string' || (typeof v !== 'string' && typeof v !== 'number')) return undefined
    return { sortBy: s, sortOrder: o, value: v, id: i }
  } catch {
    return undefined
  }
}

/**
 * Builds the page from `rows`, which a repository fetched with `limit + 1`: the extra row only says
 * there is more, and is not returned. The cursor points after the last row that is.
 */
export const makePage = <A extends { readonly id: string }, S extends string>(
  rows: ReadonlyArray<A>,
  request: PageRequest<S>
): Page<A> => {
  const more = rows.length > request.limit
  const items = more ? rows.slice(0, request.limit) : rows
  const last = items.at(-1)
  const value: unknown = last === undefined ? undefined : Reflect.get(last, request.sortBy)
  return {
    items,
    limit: request.limit,
    next:
      more && last !== undefined && (typeof value === 'string' || typeof value === 'number')
        ? encodeCursor({
            sortBy: request.sortBy,
            sortOrder: request.sortOrder,
            value,
            id: last.id
          })
        : null
  }
}
