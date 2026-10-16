import { Config, ConfigProvider, Duration, Effect, LogLevel, Redacted } from 'effect'

/**
 * What the generated example file needs to know about one variable. Built alongside the parser,
 * so the two cannot drift.
 */
export interface FieldSpec {
  readonly name: string
  readonly description: string
  /** Human-readable type, e.g. `port`, `duration`, `boolean`. */
  readonly kind: string
  /** The default exactly as it would be written in a dotenv file. */
  readonly default: string
  /** Allowed values when the variable is an enumeration. */
  readonly choices?: readonly string[]
  /** Section title; set by `group`. */
  readonly section?: string
}

/** A parser plus the documentation of every variable it reads. */
export interface Node<A> {
  readonly config: Config.Config<A>
  readonly specs: readonly FieldSpec[]
}

const field = <A>(spec: FieldSpec, config: Config.Config<A>): Node<A> => ({
  config,
  specs: [spec]
})

/** A variable with its own grammar. `parse` returns the value or a problem, which fails startup. */
export const parsed = <A>(
  name: string,
  fallback: string,
  description: string,
  parse: (raw: string) => { readonly value: A } | { readonly problem: string }
) =>
  field(
    { name, description, kind: 'string', default: fallback },
    Config.String(name).pipe(
      Config.withDefault(fallback),
      Config.mapEffect((raw): Effect.Effect<A, Config.ConfigError> => {
        const result = parse(raw.trim())
        return 'value' in result
          ? Effect.succeed(result.value)
          : Effect.fail(
              new Config.ConfigError(
                new ConfigProvider.SourceError({ message: `${name}: ${result.problem}` })
              )
            )
      })
    )
  )

/** A free-form string. */
export const text = (name: string, fallback: string, description: string) =>
  field(
    { name, description, kind: 'string', default: fallback },
    Config.String(name).pipe(Config.withDefault(fallback))
  )

/**
 * A secret, parsed as `Redacted`: it prints as `<redacted>` and is read only through
 * `Redacted.value`.
 *
 * `fallback` is a development value for the local Docker Compose stack, so the defaults work
 * with no setup. It is written to the example file as is, so it must never be a real credential.
 * Production sets its own, or the process cannot reach the service.
 */
export const secret = (name: string, description: string, fallback = '') =>
  field(
    { name, description, kind: 'secret', default: fallback },
    Config.Redacted(name).pipe(Config.withDefault(Redacted.make(fallback)))
  )

/** A fraction from 0 to 1, both inclusive. */
export const ratio = (name: string, fallback: number, description: string) =>
  field(
    { name, description, kind: 'ratio 0-1', default: String(fallback) },
    Config.Number(name).pipe(
      Config.withDefault(fallback),
      Config.mapEffect((value): Effect.Effect<number, Config.ConfigError> =>
        value >= 0 && value <= 1
          ? Effect.succeed(value)
          : Effect.fail(
              new Config.ConfigError(
                new ConfigProvider.SourceError({
                  message: `${name} must be a number from 0 to 1 (got ${value})`
                })
              )
            )
      )
    )
  )

export const port = (name: string, fallback: number, description: string) =>
  field(
    { name, description, kind: 'port', default: String(fallback) },
    Config.Port(name).pipe(Config.withDefault(fallback))
  )

export const int = (name: string, fallback: number, description: string) =>
  field(
    { name, description, kind: 'integer', default: String(fallback) },
    Config.Int(name).pipe(Config.withDefault(fallback))
  )

export const flag = (name: string, fallback: boolean, description: string) =>
  field(
    { name, description, kind: 'boolean', default: String(fallback) },
    Config.Boolean(name).pipe(Config.withDefault(fallback))
  )

/**
 * A duration as whole **milliseconds** (`REQUEST_TIMEOUT=30000`). One unit for every duration
 * variable, so no suffix is parsed: a leftover `30 seconds` fails at startup, naming the variable.
 * `min` rejects nonsense values such as a zero rate-limit window.
 */
export const milliseconds = (
  name: string,
  fallback: number,
  description: string,
  options: { readonly min?: number } = {}
) => {
  const min = options.min ?? 0
  const reject = (got: string) =>
    Effect.fail(
      new Config.ConfigError(
        new ConfigProvider.SourceError({
          message: `${name} must be a whole number of milliseconds, at least ${min} (got "${got}")`
        })
      )
    )

  return field(
    { name, description, kind: 'milliseconds', default: String(fallback) },
    // Read as text: Effect's integer parser would reject `30 seconds` with a message that
    // names no unit.
    Config.String(name).pipe(
      Config.withDefault(String(fallback)),
      Config.mapEffect((raw): Effect.Effect<Duration.Duration, Config.ConfigError> => {
        const digits = raw.trim()
        if (!/^-?\d+$/.test(digits)) return reject(raw)
        const value = Number(digits)
        return Number.isSafeInteger(value) && value >= min
          ? Effect.succeed(Duration.millis(value))
          : reject(raw)
      })
    )
  )
}

export const choice = <const L extends readonly [string, ...string[]]>(
  name: string,
  choices: L,
  fallback: L[number],
  description: string
) =>
  field(
    { name, description, kind: 'enum', default: fallback, choices },
    Config.Literals(choices, name).pipe(Config.withDefault(fallback))
  )

/** A comma-separated subset of `choices` (`console,file`). Unknown or empty input fails startup. */
export const choiceList = <const L extends readonly [string, ...string[]]>(
  name: string,
  choices: L,
  fallback: readonly L[number][],
  description: string
) => {
  const isChoice = (value: string): value is L[number] =>
    choices.some((candidate) => candidate === value)
  const expected = choices.join(' | ')
  const reject = (got: string) =>
    Effect.fail(
      new Config.ConfigError(
        new ConfigProvider.SourceError({
          message: `${name} must be a comma-separated list of: ${expected} (got "${got}")`
        })
      )
    )

  return field(
    { name, description, kind: 'list', default: fallback.join(','), choices },
    Config.String(name).pipe(
      Config.withDefault(fallback.join(',')),
      Config.mapEffect((raw): Effect.Effect<readonly L[number][], Config.ConfigError> => {
        const entries = raw
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
        const known = entries.filter(isChoice)
        if (entries.length === 0 || known.length !== entries.length) return reject(raw)
        return Effect.succeed([...new Set(known)])
      })
    )
  )
}

export const logLevel = (name: string, fallback: LogLevel.LogLevel, description: string) =>
  field(
    { name, description, kind: 'enum', default: fallback, choices: LogLevel.values },
    Config.LogLevel(name).pipe(Config.withDefault(fallback))
  )

/** The value a node parses to. */
export type ValueOf<N> = N extends Node<infer A> ? A : never

type Nodes = Readonly<Record<string, Node<unknown>>>

type Parsed<N extends Nodes> = { readonly [K in keyof N]: N[K] extends Node<infer A> ? A : never }

interface GroupOptions<A, B> {
  /** Names the section in the example file. */
  readonly title?: string
  /** Cross-field validation or reshaping, applied after every field parsed. */
  readonly transform?: (parsed: A) => Effect.Effect<B, Config.ConfigError>
}

/** Combines nodes into one parser keyed like the input, concatenating their documentation. */
export function group<N extends Nodes>(
  nodes: N,
  options?: GroupOptions<Parsed<N>, Parsed<N>>
): Node<Parsed<N>>
export function group<N extends Nodes, B>(
  nodes: N,
  options: GroupOptions<Parsed<N>, B> & {
    readonly transform: (parsed: Parsed<N>) => Effect.Effect<B, Config.ConfigError>
  }
): Node<B>
export function group(
  nodes: Nodes,
  options: GroupOptions<Record<string, unknown>, unknown> = {}
): Node<unknown> {
  const all = Config.all(
    Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, node.config]))
  )
  const config =
    options.transform === undefined ? all : all.pipe(Config.mapEffect(options.transform))
  const specs = Object.values(nodes).flatMap((node) => node.specs)
  const { title } = options

  return {
    config,
    specs: title === undefined ? specs : specs.map((spec) => ({ ...spec, section: title }))
  }
}
