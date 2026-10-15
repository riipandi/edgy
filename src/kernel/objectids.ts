import { Schema } from 'effect'
import { typeid } from 'typeid-js'

/**
 * Identifiers are TypeIDs: a lowercase prefix naming the kind, an underscore, and 26 base32
 * characters (`user_01h2xcejqtf2nbrexx3vqjhp41`). A pasted id still says what it identifies, and
 * an id of the wrong kind is refused at the edge.
 *
 * This module is the mechanism only. Each kind declares its prefix next to what it identifies, so
 * adding one never edits a shared list; `defineId` refuses a prefix that is already taken.
 */

/** The 26-character suffix: 128 bits, so the first character is at most `7`. */
export const ID_SUFFIX = '[0-7][0-9a-hjkmnp-tv-z]{25}'

const PREFIX = /^[a-z]([a-z_]{0,61}[a-z])?$/

const taken = new Set<string>()

/** One kind of identifier: how to mint it, and how to recognise it. */
export interface IdKind {
  readonly prefix: string
  /** A new id. The suffix is a UUIDv7, so ids sort by creation time and their index appends. */
  readonly make: () => string
  /** Checks prefix and suffix on the text. No decode, so each check is one regex. */
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
