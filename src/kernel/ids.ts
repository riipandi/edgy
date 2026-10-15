import { Schema } from 'effect'
import { typeid } from 'typeid-js'

/**
 * Every identifier this service mints or reads, as a TypeID: a lowercase prefix naming what
 * the id is, an underscore, and 26 characters of base32 (`user_01h2xcejqtf2nbrexx3vqjhp41`).
 * A bare id pasted into a log search, an issue or a chat still says what it identifies, and an
 * id of the wrong kind is refused at the edge instead of reaching a query.
 *
 * One table, so a prefix is chosen once and is never repeated as a string literal.
 */
export const ID_PREFIX = {
  /** One HTTP request (`x-request-id`, `metadata.request_id`, every log line of it). */
  request: 'req',
  /** One trace; the same 128 bits as the OpenTelemetry trace id, written as a TypeID. */
  trace: 'trc',
  /** One process or Worker isolate (`service.instance.id`). */
  instance: 'inst',
  /** A row of `users`. */
  user: 'user'
} as const

export type IdKind = keyof typeof ID_PREFIX

/**
 * A new id of `kind`. The suffix is a UUIDv7, so ids sort by creation time: a table keyed by
 * them is naturally ordered, and an index on them appends instead of scattering.
 */
export const newId = (kind: IdKind): string => typeid(ID_PREFIX[kind]).toString()

const SUFFIX = '[0-7][0-9a-hjkmnp-tv-z]{25}'

/**
 * Schema for an id of `kind`: the right prefix and a well-formed suffix. A check on the text, not
 * a decode, so it costs a regex per id. The first suffix character is at most `7` because the 26
 * characters carry 128 bits, not 130.
 */
export const idSchema = (kind: IdKind) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isPattern(new RegExp(`^${ID_PREFIX[kind]}_${SUFFIX}$`), {
        message: `must be a ${ID_PREFIX[kind]}_ id`
      })
    )
  )

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * The OpenTelemetry trace id (32 hex characters) as a `trc_` TypeID, and back. The mapping is the
 * identity on the 128 bits, so a `trc_` id found in a response or a log can be turned into the
 * hex id a tracing backend searches by (`traceHexOf`), and nothing is stored to relate the two.
 *
 * It is encoded here instead of through `typeid-js` because that library accepts only UUIDv7
 * values, and a trace id is random.
 */
export const traceTypeId = (hex: string): string => {
  let value = BigInt(`0x${hex}`)
  let suffix = ''
  for (let i = 0; i < 26; i += 1) {
    suffix = ALPHABET[Number(value & 31n)] + suffix
    value >>= 5n
  }
  return `${ID_PREFIX.trace}_${suffix}`
}

/** The 32-character hex trace id behind a `trc_` id, or `undefined` if `id` is not one. */
export const traceHexOf = (id: string): string | undefined => {
  if (!new RegExp(`^${ID_PREFIX.trace}_${SUFFIX}$`).test(id)) return undefined
  let value = 0n
  for (const char of id.slice(ID_PREFIX.trace.length + 1)) {
    value = (value << 5n) | BigInt(ALPHABET.indexOf(char))
  }
  return value.toString(16).padStart(32, '0')
}
