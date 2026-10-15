/**
 * Requests nobody needs to read about: a browser asking for a favicon, a crawler for
 * `robots.txt`, a load balancer polling `/health`, a bot probing for WordPress. Left alone they
 * bury the requests that matter, one `WARN` line per 404.
 *
 * They are quieted, not dropped: the request log line is written at `Debug`, so it is hidden at
 * `Info` and shown with `LOG_LEVEL=Debug`. Metrics still count them, since a spike in scanner
 * 404s is a signal. A quiet request that fails is never quieted: a `/health` answering 503 or
 * 500 is logged like any other error.
 *
 * The list is code, not configuration: it changes when the world changes, not per deployment.
 * Add a path or pattern to a group in {@link RULES}, or a group for a new kind. The tests pin
 * every entry, so a rule that stops matching fails.
 */

/** Which responses of a matching request are quiet. */
type Quiet = (status: number) => boolean

const succeeded: Quiet = (status) => status < 400
const succeededOrMissing: Quiet = (status) => status < 400 || status === 404
const missing: Quiet = (status) => status === 404

interface Rule {
  /** Shown as the `quiet` annotation of the debug line. */
  readonly name: string
  /** Exact paths. */
  readonly paths?: readonly string[]
  /** Paths starting with one of these. */
  readonly prefixes?: readonly string[]
  /** Anything else; tested last, and only when no cheaper test matched. */
  readonly patterns?: readonly RegExp[]
  readonly quiet: Quiet
  /**
   * A probe is polled on a timer by something that is not a user. Beyond the quiet log line, it
   * is left out of the latency histogram (instant answers drag p50 and p99 down) and its trace is
   * not recorded. The request counter still counts it.
   */
  readonly probe?: boolean
}

/** One group per reason a request is noise. Order does not matter; names must be unique. */
const RULES: readonly Rule[] = [
  {
    // What a browser asks for on its own, whatever the page.
    name: 'browser',
    paths: ['/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'],
    // Chrome DevTools (`com.chrome.devtools.json`) and other tools' app-specific probes.
    prefixes: ['/.well-known/appspecific/'],
    quiet: succeededOrMissing
  },
  {
    name: 'crawler',
    paths: ['/robots.txt', '/sitemap.xml', '/ads.txt', '/security.txt'],
    quiet: succeededOrMissing
  },
  {
    // Polled by load balancers and scrapers; only a failure is news.
    name: 'probe',
    paths: ['/health', '/metrics'],
    quiet: succeeded,
    probe: true
  },
  {
    // Vulnerability scanners guessing at software this server does not run. Only their
    // 404s are quiet: the same path answering anything else would be a surprise.
    name: 'scanner',
    prefixes: ['/wp-', '/phpmyadmin', '/cgi-bin/', '/.git/', '/.aws/', '/.ssh/', '/actuator'],
    patterns: [/\.php\d?$/i, /^\/\.env(\.|$)/, /^\/xmlrpc/i, /^\/server-status/i],
    quiet: missing
  }
]

const exact = new Map<string, Rule>()
for (const rule of RULES) {
  for (const path of rule.paths ?? []) {
    if (exact.has(path)) throw new Error(`quiet path ${path} is listed in two rules`)
    exact.set(path, rule)
  }
}

/** The rule a request falls under, whatever its status; `undefined` for an ordinary request. */
const ruleOf = (path: string): Rule | undefined => {
  const byPath = exact.get(path)
  if (byPath !== undefined) return byPath

  for (const rule of RULES) {
    if (rule.prefixes?.some((prefix) => path.startsWith(prefix))) return rule
  }
  return RULES.find((rule) => rule.patterns?.some((pattern) => pattern.test(path)))
}

/**
 * Name of the rule that makes this response quiet, or `undefined` when it is logged normally.
 * On the hot path this is one map lookup and a short prefix scan; patterns run only for paths
 * that matched nothing else.
 */
export const quietReason = (path: string, status: number): string | undefined => {
  const rule = ruleOf(path)
  return rule !== undefined && rule.quiet(status) ? rule.name : undefined
}

/** Whether the path is a probe: no latency sample, no recorded trace. */
export const isProbe = (path: string): boolean => ruleOf(path)?.probe === true
