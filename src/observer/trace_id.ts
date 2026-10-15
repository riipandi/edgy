import { defineId, ID_SUFFIX } from '../kernel/objectids.ts'

/** `trc_…`: a trace, for people. Backends index the hex id; see {@link traceTypeId}. */
export const TraceId = defineId('trc')

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * The OpenTelemetry trace id (32 hex characters) as a `trc_` TypeID, and back. The mapping is the
 * identity on the 128 bits, so a `trc_` id found in a response or a log can be turned into the
 * hex id a tracing backend searches by (`traceHexOf`), and nothing is stored to relate the two.
 *
 * It is encoded here instead of through `typeid-js` because that library accepts only UUIDv7
 * values, and a trace id is random; that is also why `TraceId.make` is never used.
 */
export const traceTypeId = (hex: string): string => {
  let value = BigInt(`0x${hex}`)
  let suffix = ''
  for (let i = 0; i < 26; i += 1) {
    suffix = ALPHABET[Number(value & 31n)] + suffix
    value >>= 5n
  }
  return `${TraceId.prefix}_${suffix}`
}

const TRACE = new RegExp(`^${TraceId.prefix}_${ID_SUFFIX}$`)

/** The 32-character hex trace id behind a `trc_` id, or `undefined` if `id` is not one. */
export const traceHexOf = (id: string): string | undefined => {
  if (!TRACE.test(id)) return undefined
  let value = 0n
  for (const char of id.slice(TraceId.prefix.length + 1)) {
    value = (value << 5n) | BigInt(ALPHABET.indexOf(char))
  }
  return value.toString(16).padStart(32, '0')
}
