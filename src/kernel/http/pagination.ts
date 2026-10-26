import { Schema } from 'effect'

// Shared query fields for a cursor-paginated list endpoint. Spread into an
// endpoint's own `query: Schema.Struct({ ...PaginationFields })` rather than
// redeclared per endpoint.
export const PaginationFields = {
  limit: Schema.optional(
    Schema.FiniteFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(100)
      )
    )
  ),
  cursor: Schema.optional(Schema.String),
  sort_by: Schema.optional(Schema.String),
  sort_order: Schema.optional(Schema.Literals(['asc', 'desc']))
}

export interface CursorPayload {
  readonly [key: string]: string | number
}

// Opaque to the caller: a base64url JSON envelope. What it encodes (an id,
// a sort value, both) is each list endpoint's own choice, decided where it
// builds its query.
export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')

export const decodeCursor = <T extends CursorPayload>(cursor: string): T | undefined => {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T
  } catch {
    return undefined
  }
}
