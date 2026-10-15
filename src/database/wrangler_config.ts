/**
 * Reads JSON with comments and trailing commas, the form of `wrangler.jsonc`. Strings are left
 * alone, so a `//` inside a URL is not a comment.
 */
export const parseJsonc = (text: string): unknown => {
  let out = ''
  let i = 0
  while (i < text.length) {
    const char = text[i]!
    if (char === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      out += text.slice(i, end + 1)
      i = end + 1
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    } else if (char === ',') {
      let next = i + 1
      while (next < text.length && /\s/.test(text[next]!)) next += 1
      // Whitespace and comments after a comma may hide the closing bracket; a comment is rare
      // there, so only a plain closing bracket is recognised.
      if (text[next] !== '}' && text[next] !== ']') out += char
      i += 1
    } else {
      out += char
      i += 1
    }
  }
  return JSON.parse(out)
}

/**
 * The same Wrangler configuration with the D1 binding `binding` marked `remote: true`, as JSON.
 * Wrangler's local proxy then talks to the real database instead of a local copy. Other bindings
 * and settings are left as they are.
 */
export const withRemoteD1 = (config: string, binding: string): string => {
  const parsed = parseJsonc(config)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The Wrangler configuration is not an object')
  }
  const databases = 'd1_databases' in parsed ? parsed.d1_databases : undefined
  const found =
    Array.isArray(databases) &&
    databases.some((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return false
      if (!('binding' in entry) || entry.binding !== binding) return false
      Object.assign(entry, { remote: true })
      return true
    })
  if (!found) {
    throw new Error(
      `No D1 binding named "${binding}" in the Wrangler configuration (set D1_BINDING)`
    )
  }
  return `${JSON.stringify(parsed, null, 2)}\n`
}
