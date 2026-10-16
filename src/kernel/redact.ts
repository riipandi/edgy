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

/**
 * `scheme://user:password@host`, the form connection strings take (Redis, Postgres, HTTP). The
 * password runs to the last `@` of the token, since an unescaped `/` or `@` inside it is common
 * and a partial redaction would leak the rest.
 */
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:)\S+(@)/gi

/** `Authorization`-style values: a scheme word followed by an opaque credential. */
const AUTH_SCHEME = /\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g

/** A JSON Web Token: three dot-separated base64url parts, the first two starting `eyJ`. */
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g

/** The words that mark a `name=value` pair as secret (a substring of the name is enough). */
const KEYWORD =
  /pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|apikey|authorization|cookie|credential|private[-_]?key|access[-_]?key|session[-_]?id|signature/gi

/**
 * What may follow the keyword before the separator: the rest of the name (bounded), an optional
 * closing quote, and `:`, `=` or a fullwidth colon. Sticky, so it is tried only at the end of a
 * keyword, never searched for.
 */
const AFTER_NAME = /[A-Za-z0-9_-]{0,64}["']?\s*[:=\uFF1A]\s*/y

/** The value: quoted, a scheme word plus its credential, or a run up to the next separator. */
const VALUE = /"[^"]*"|'[^']*'|(?:Bearer|Basic|Digest|Token)\s+[^\s,;&"')}\]]+|[^\s,;&"')}\]]+/y

/** `--password hunter2` and `--api-key=abc`: a command-line flag whose name is a keyword. */
const CLI_FLAG =
  /(--[\w-]{0,64}?(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|apikey|credential|private[-_]?key|access[-_]?key)[\w-]{0,64}[ =])\S+/gi

/**
 * Replaces the value of every `name=value`, `name: value`, `"name":"value"` and `name='value'`
 * whose name holds a keyword. Keywords are found in one pass and checked only at their position:
 * no pattern scans from every offset, so adversarial input stays linear.
 */
const redactNamedValues = (text: string): string => {
  let out = ''
  let copied = 0
  for (const keyword of text.matchAll(KEYWORD)) {
    if (keyword.index < copied) continue // inside a value already replaced
    AFTER_NAME.lastIndex = keyword.index + keyword[0].length
    if (!AFTER_NAME.test(text)) continue
    VALUE.lastIndex = AFTER_NAME.lastIndex
    const nameEnd = AFTER_NAME.lastIndex
    if (!VALUE.test(text)) continue
    const value = text.slice(nameEnd, VALUE.lastIndex)
    const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : ''
    out += `${text.slice(copied, nameEnd)}${quote}${REDACTED}${quote}`
    copied = VALUE.lastIndex
  }
  return out + text.slice(copied)
}

/** Cut before any pattern runs; no error message needs more. */
const MAX_TEXT = 16_384

/**
 * Removes secrets from free text: URL credentials, bearer and basic tokens, JWTs, command-line
 * flags and sensitive `name=value` pairs. The text was never meant to be shown, so this errs toward
 * removing too much; a value recognised by neither shape nor name is kept. Text over `MAX_TEXT`
 * characters is truncated.
 */
export const redactText = (text: string): string => {
  const bounded = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…[truncated]` : text
  return redactNamedValues(bounded.replace(URL_CREDENTIALS, `$1${REDACTED}$2`))
    .replace(CLI_FLAG, `$1${REDACTED}`)
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(JWT, REDACTED)
}

const MAX_DEPTH = 6

/**
 * A copy of `value` safe to log or show: strings go through `redactText`, a value under a
 * sensitive key or an Effect `Redacted` becomes `REDACTED`, and an `Error` becomes its name and
 * message. Depth is bounded, so cyclic or huge objects cannot hang it.
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
