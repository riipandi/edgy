import { Redacted } from 'effect'

/** What replaces a sensitive value. Constant, so it reveals neither the length nor the shape. */
export const REDACTED = '[REDACTED]'

/**
 * Names that mark a value as secret, whether it is an object key, a `key=value` pair in a log
 * line or a JSON field in an error message. Matched as a word inside the name, so `db_password`,
 * `x-api-key` and `refreshToken` all count while `passenger` does not.
 */
const SENSITIVE_NAME =
  /(?:^|[^a-z])(pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|apikey|auth(?:orization)?|cookie|credential|private[-_]?key|access[-_]?key|session[-_]?id|signature|otp|pin)(?:$|[^a-z])/i

/** Whether a key or field name denotes a secret. */
export const isSensitiveName = (name: string): boolean =>
  SENSITIVE_NAME.test(name.replace(/([a-z])([A-Z])/g, '$1_$2'))

/** `scheme://user:password@host`, the form connection strings take (Redis, Postgres, HTTP). */
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:)[^\s/@]+(@)/gi

/** `Authorization`-style values: a scheme word followed by an opaque credential. */
const AUTH_SCHEME = /\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g

/** A JSON Web Token: three dot-separated base64url parts, the first two starting `eyJ`. */
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g

/**
 * `name=value`, `name: value`, `"name":"value"` and `name='value'` where `name` is sensitive. The
 * value runs to the next separator, or to the closing quote when quoted.
 */
const NAMED_VALUE =
  /([A-Za-z0-9_-]*(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|apikey|authorization|cookie|credential|private[-_]?key|access[-_]?key|session[-_]?id|signature)[A-Za-z0-9_-]*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|(?:Bearer|Basic|Digest|Token)\s+[^\s,;&"')}\]]+|[^\s,;&"')}\]]+)/gi

/**
 * Removes secrets from free text: credentials in URLs, bearer and basic tokens, JWTs, and the
 * value of any sensitive-looking `name=value` pair. It works on text that was never meant to be
 * shown (an error message, a driver's complaint, a log line), so it errs toward removing too
 * much; a value it cannot recognise by shape or name is not touched.
 */
export const redactText = (text: string): string =>
  text
    .replace(URL_CREDENTIALS, `$1${REDACTED}$2`)
    .replace(NAMED_VALUE, (_match, name: string, value: string) => {
      const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : ''
      return `${name}${quote}${REDACTED}${quote}`
    })
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(JWT, REDACTED)

const MAX_DEPTH = 6

/**
 * A copy of `value` that is safe to log or show: strings pass through {@link redactText}, a value
 * under a sensitive key (and any Effect `Redacted`) becomes {@link REDACTED}, and an `Error`
 * becomes its name and message. Depth is bounded, so a cyclic or enormous object cannot hang it.
 */
export const redactValue = (value: unknown, depth = 0): unknown => {
  if (Redacted.isRedacted(value)) return REDACTED
  if (typeof value === 'string') return redactText(value)
  if (typeof value !== 'object' || value === null) return value
  if (depth >= MAX_DEPTH) return '[…]'
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveName(key) ? REDACTED : redactValue(entry, depth + 1)
    ])
  )
}

/** The message of whatever was thrown, redacted; empty when there is nothing to say. */
export const describeFailure = (failure: unknown): string => {
  if (failure === undefined || failure === null) return ''
  if (failure instanceof Error) return redactText(failure.message)
  if (typeof failure === 'string') return redactText(failure)
  if (typeof failure === 'object' && 'message' in failure)
    return redactText(String(failure.message))
  return ''
}
