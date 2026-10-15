import { Schema } from 'effect'
import { typeid } from 'typeid-js'

/**
 * Identifiers are TypeIDs: a lowercase prefix naming what the id is, an underscore, and 26
 * characters of base32 (`user_01h2xcejqtf2nbrexx3vqjhp41`). A bare id pasted into a log search,
 * an issue or a chat still says what it identifies, and an id of the wrong kind is refused at the
 * edge instead of reaching a query.
 *
 * This file is the mechanism only. The prefix of each kind is declared next to the thing it
 * identifies (`UserId` in the user schema, `RequestId` in the request-id plugin), so adding a
 * kind never edits a shared list; {@link defineId} refuses a prefix that is already taken.
 */

/** The 26-character suffix: 128 bits, so the first character is at most `7`. */
export const ID_SUFFIX = '[0-7][0-9a-hjkmnp-tv-z]{25}'

const PREFIX = /^[a-z]([a-z_]{0,61}[a-z])?$/

const taken = new Set<string>()

/** One kind of identifier: how to mint it, and how to recognise it. */
export interface IdKind {
  readonly prefix: string
  /**
   * A new id. The suffix is a UUIDv7, so ids sort by creation time: a table keyed by them is
   * naturally ordered, and an index on them appends instead of scattering.
   */
  readonly make: () => string
  /**
   * The right prefix and a well-formed suffix. A check on the text, not a decode, so it costs a
   * regex per id.
   */
  readonly schema: Schema.String
}

/** Declares an id kind. Call once, at module level, next to what the id identifies. */
export const defineId = (prefix: string): IdKind => {
  if (!PREFIX.test(prefix)) throw new Error(`Invalid id prefix "${prefix}"`)
  if (taken.has(prefix)) throw new Error(`Id prefix "${prefix}" is already in use`)
  taken.add(prefix)

  const pattern = new RegExp(`^${prefix}_${ID_SUFFIX}$`)
  return {
    prefix,
    make: () => typeid(prefix).toString(),
    schema: Schema.String.pipe(
      Schema.check(Schema.isPattern(pattern, { message: `must be a ${prefix}_ id` }))
    )
  }
}
