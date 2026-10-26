import { Config, ConfigProvider, Duration, Effect, LogLevel, Redacted } from 'effect'

export interface FieldSpec {
  readonly name: string
  readonly description: string
  readonly kind: string
  readonly default: string
  readonly choices?: readonly string[]
  readonly section?: string
}

export interface Node<A> {
  readonly config: Config.Config<A>
  readonly specs: readonly FieldSpec[]
}

const field = <A>(spec: FieldSpec, config: Config.Config<A>): Node<A> => ({
  config,
  specs: [spec]
})

/** A field whose parsing goes beyond the standard kinds. */
export const custom = field

export const invalid = (name: string, message: string) =>
  new Config.ConfigError(new ConfigProvider.SourceError({ message: `${name}: ${message}` }))

export const text = (name: string, fallback: string, description: string) =>
  field(
    { name, description, kind: 'string', default: fallback },
    Config.String(name).pipe(Config.withDefault(fallback))
  )

export const secret = (name: string, fallback: string, description: string) =>
  field(
    { name, description, kind: 'secret', default: fallback },
    Config.Redacted(name).pipe(Config.withDefault(Redacted.make(fallback)))
  )

export const port = (name: string, fallback: number, description: string) =>
  field(
    { name, description, kind: 'port', default: String(fallback) },
    Config.Port(name).pipe(Config.withDefault(fallback))
  )

export const int = (name: string, fallback: number, description: string, min = 0) =>
  field(
    { name, description, kind: 'integer', default: String(fallback) },
    Config.Int(name).pipe(
      Config.withDefault(fallback),
      Config.mapEffect((value) =>
        value >= min ? Effect.succeed(value) : Effect.fail(invalid(name, `must be at least ${min}`))
      )
    )
  )

export const flag = (name: string, fallback: boolean, description: string) =>
  field(
    { name, description, kind: 'boolean', default: String(fallback) },
    Config.Boolean(name).pipe(Config.withDefault(fallback))
  )

export const milliseconds = (name: string, fallback: number, description: string, min = 0) =>
  field(
    { name, description, kind: 'milliseconds', default: String(fallback) },
    Config.String(name).pipe(
      Config.withDefault(String(fallback)),
      Config.mapEffect((raw) => {
        const value = Number(raw.trim())
        return /^\d+$/.test(raw.trim()) && Number.isSafeInteger(value) && value >= min
          ? Effect.succeed(Duration.millis(value))
          : Effect.fail(invalid(name, `must be whole milliseconds, at least ${min}`))
      })
    )
  )

export const choice = <const Choices extends readonly [string, ...string[]]>(
  name: string,
  choices: Choices,
  fallback: Choices[number],
  description: string
) =>
  field(
    { name, description, kind: 'enum', default: fallback, choices },
    Config.Literals(choices, name).pipe(Config.withDefault(fallback))
  )

export const choiceList = <const Choices extends readonly [string, ...string[]]>(
  name: string,
  choices: Choices,
  fallback: readonly Choices[number][],
  description: string
) =>
  field(
    { name, description, kind: 'list', default: fallback.join(','), choices },
    Config.String(name).pipe(
      Config.withDefault(fallback.join(',')),
      Config.mapEffect((raw) => {
        const values = raw.split(',').map((value) => value.trim())
        const valid = values.filter((value): value is Choices[number] =>
          choices.some((choice) => choice === value)
        )
        return valid.length === values.length && values.length > 0
          ? Effect.succeed([...new Set(valid)])
          : Effect.fail(invalid(name, `expected a comma-separated list of ${choices.join(', ')}`))
      })
    )
  )

export const logLevel = (name: string, fallback: LogLevel.LogLevel, description: string) =>
  field(
    { name, description, kind: 'enum', default: fallback, choices: LogLevel.values },
    Config.LogLevel(name).pipe(Config.withDefault(fallback))
  )

export type ValueOf<N> = N extends Node<infer A> ? A : never

type Nodes = Readonly<Record<string, Node<unknown>>>
type Parsed<N extends Nodes> = { readonly [K in keyof N]: ValueOf<N[K]> }

export function group<N extends Nodes>(nodes: N, title?: string): Node<Parsed<N>> {
  const config = Config.all(
    Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, node.config]))
  ) as Config.Config<Parsed<N>>
  const specs = Object.values(nodes).flatMap((node) => node.specs)
  return {
    config,
    specs: title === undefined ? specs : specs.map((spec) => ({ ...spec, section: title }))
  }
}
