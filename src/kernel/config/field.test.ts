import { Cause, Config, ConfigProvider, Duration, Effect, Redacted } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import {
  choice,
  choiceList,
  flag,
  group,
  int,
  logLevel,
  milliseconds,
  port,
  secret,
  text
} from './field.ts'

const fromEnv = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))

const resolved = <A>(config: Config.Config<A>, env: Record<string, string> = {}) =>
  Effect.runPromise(config.pipe(Effect.provide(fromEnv(env))))

const failed = async <A>(config: Config.Config<A>, env: Record<string, string>) => {
  const outcome = await Effect.runPromiseExit(config.pipe(Effect.provide(fromEnv(env))))
  expect(outcome._tag).toBe('Failure')
  return outcome._tag === 'Failure' ? Cause.pretty(outcome.cause) : ''
}

describe('field helpers resolve values from the environment', () => {
  it('text falls back and overrides', async () => {
    const field = text('TEST_TEXT', 'fallback', 'A text field')
    await expect(resolved(field.config)).resolves.toBe('fallback')
    await expect(resolved(field.config, { TEST_TEXT: 'given' })).resolves.toBe('given')
  })

  it('secret wraps the value in a Redacted', async () => {
    const field = secret('TEST_SECRET', 'fallback', 'A secret field')
    const given = await resolved(field.config, { TEST_SECRET: 's3cret' })
    expect(Redacted.value(given)).toBe('s3cret')
    const fallback = await resolved(field.config)
    expect(Redacted.value(fallback)).toBe('fallback')
  })

  it('port accepts 1-65535 and rejects the rest', async () => {
    const field = port('TEST_PORT', 3000, 'A port field')
    await expect(resolved(field.config, { TEST_PORT: '8080' })).resolves.toBe(8080)
    await expect(resolved(field.config, { TEST_PORT: '65535' })).resolves.toBe(65535)
    await expect(failed(field.config, { TEST_PORT: '0' })).resolves.toContain('between 1 and 65535')
    await expect(failed(field.config, { TEST_PORT: '65536' })).resolves.toContain(
      'between 1 and 65535'
    )
    await expect(failed(field.config, { TEST_PORT: 'http' })).resolves.toContain(
      'representing a finite number'
    )
    await expect(resolved(field.config)).resolves.toBe(3000)
  })

  it('int enforces its minimum', async () => {
    const field = int('TEST_N', 5, 'An int field', 3)
    await expect(resolved(field.config, { TEST_N: '4' })).resolves.toBe(4)
    await expect(failed(field.config, { TEST_N: '2' })).resolves.toContain('must be at least 3')
    await expect(resolved(field.config)).resolves.toBe(5)
  })

  it('flag accepts the documented truthy and falsy words', async () => {
    const field = flag('TEST_FLAG', false, 'A flag field')
    await expect(resolved(field.config, { TEST_FLAG: 'true' })).resolves.toBe(true)
    await expect(resolved(field.config, { TEST_FLAG: 'yes' })).resolves.toBe(true)
    await expect(resolved(field.config, { TEST_FLAG: 'false' })).resolves.toBe(false)
    await expect(failed(field.config, { TEST_FLAG: 'maybe' })).resolves.toContain('TEST_FLAG')
    await expect(resolved(field.config)).resolves.toBe(false)
  })

  it('milliseconds parses whole non-negative values and rejects the rest', async () => {
    const field = milliseconds('TEST_MS', 250, 'A duration field', 1)
    const given = await resolved(field.config, { TEST_MS: '500' })
    expect(Duration.toMillis(given)).toBe(500)
    const spaced = await resolved(field.config, { TEST_MS: ' 750 ' })
    expect(Duration.toMillis(spaced)).toBe(750)
    await expect(failed(field.config, { TEST_MS: 'soon' })).resolves.toContain(
      'must be whole milliseconds'
    )
    await expect(failed(field.config, { TEST_MS: '1.5' })).resolves.toContain(
      'must be whole milliseconds'
    )
    await expect(failed(field.config, { TEST_MS: '-5' })).resolves.toContain(
      'must be whole milliseconds'
    )
    await expect(failed(field.config, { TEST_MS: '0' })).resolves.toContain('at least 1')
  })

  it('choice accepts only the listed literals', async () => {
    const field = choice('TEST_CHOICE', ['pretty', 'json'], 'pretty', 'A choice field')
    await expect(resolved(field.config, { TEST_CHOICE: 'json' })).resolves.toBe('json')
    await expect(failed(field.config, { TEST_CHOICE: 'xml' })).resolves.toContain('TEST_CHOICE')
    await expect(resolved(field.config)).resolves.toBe('pretty')
  })

  it('choiceList trims, dedupes, and rejects unknown entries', async () => {
    const field = choiceList('TEST_LIST', ['console', 'file'], ['console'], 'A list field')
    await expect(
      resolved(field.config, { TEST_LIST: ' console , file , console ' })
    ).resolves.toEqual(['console', 'file'])
    await expect(failed(field.config, { TEST_LIST: 'console,udp' })).resolves.toContain(
      'comma-separated list'
    )
    await expect(failed(field.config, { TEST_LIST: ' ' })).resolves.toContain(
      'comma-separated list'
    )
  })

  it('logLevel accepts the capitalized level names', async () => {
    const field = logLevel('TEST_LEVEL', 'Info', 'A level field')
    await expect(resolved(field.config, { TEST_LEVEL: 'Debug' })).resolves.toBe('Debug')
    await expect(failed(field.config, { TEST_LEVEL: 'debug' })).resolves.toContain(
      'Expected "All" | "Fatal"'
    )
    await expect(resolved(field.config)).resolves.toBe('Info')
  })
})

describe('group', () => {
  it('resolves every child from one environment', async () => {
    const composite = group({
      host: text('TEST_HOST', 'localhost', 'Host'),
      port: port('TEST_PORT', 3000, 'Port')
    })
    const parsed = await resolved(composite.config, { TEST_HOST: 'edgy.test', TEST_PORT: '8080' })
    expect(parsed).toEqual({ host: 'edgy.test', port: 8080 })
  })

  it('tags every spec with the section title', () => {
    const titled = group(
      { host: text('TEST_HOST', 'localhost', 'Host'), port: port('TEST_PORT', 3000, 'Port') },
      'Server'
    )
    expect(titled.specs.map((spec) => spec.section)).toEqual(['Server', 'Server'])
    expect(titled.specs.map((spec) => spec.name)).toEqual(['TEST_HOST', 'TEST_PORT'])

    const untitled = group({ host: text('TEST_HOST', 'localhost', 'Host') })
    expect(untitled.specs[0]?.section).toBeUndefined()
  })
})
