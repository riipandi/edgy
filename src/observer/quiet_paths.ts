/**
 * Requests nobody needs to read about: a browser asking for a favicon, a crawler for
 * `robots.txt`, a load balancer polling `/health` every second, a bot probing for
 * WordPress. Left alone they bury the requests that matter, one `WARN` line per 404.
 *
 * They are *quieted*, not dropped: the request log line is written at `Debug`, so it
 * disappears at `Info` and returns with `LOG_LEVEL=Debug` when someone needs to know why
 * a browser keeps asking for a file. Metrics still count them (a spike in scanner 404s is
 * a signal), and a quiet request that fails is never quieted: a `/health` that answers 503
 * or 500 is logged like any other error.
 *
 * The list is code, not configuration: it changes when the *world* changes (a browser
 * starts asking for a new file), not per deployment. To add one, add a path or pattern to
 * the right group in {@link RULES}; to add a kind, add a group. `quiet_paths.test.ts`
 * pins every entry, so a rule that stops matching fails a test.
 */

/** Which responses of a matching request are quiet. */
type Quiet = (status: number) => boolean

const succeeded: Quiet = (status) => status < 400
const succeededOrMissing: Quiet = (status) => status < 400 || status === 404
const missing: Quiet = (status) => status === 404

interface Rule {
  /** Shown as the `quiet` annotation of the debug line, so it says why it was quieted. */
  readonly name: string
  /** Exact paths. */
  readonly paths?: readonly string[]
  /** Paths starting with one of these. */
  readonly prefixes?: readonly string[]
  /** Anything else; tested last, and only when no cheaper test matched. */
  readonly patterns?: readonly RegExp[]
  readonly quiet: Quiet
  /**
   * A probe is polled on a timer by something that is not a user. Beyond a quiet log line
   * it is left out of the latency histogram (a stream of instant answers drags p50 and
   * p99 down) and its trace is not recorded; the request counter still counts it.
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
 * Name of the rule that makes this response quiet, or `undefined` when it should be logged
 * normally. Cheap on the hot path: one map lookup and a short prefix scan, and the
 * patterns only run for a path that matched nothing else.
 */
export const quietReason = (path: string, status: number): string | undefined => {
  const rule = ruleOf(path)
  return rule !== undefined && rule.quiet(status) ? rule.name : undefined
}

/** Whether the path is a probe: no latency sample, no recorded trace. */
export const isProbe = (path: string): boolean => ruleOf(path)?.probe === true
