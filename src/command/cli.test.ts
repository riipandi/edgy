import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from '@effect/vitest'
import { ConfigProvider, Exit, Layer, ManagedRuntime } from 'effect'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigLayer } from '../kernel/config/service.ts'
import { runWith } from './cli.ts'

interface Outcome {
  readonly exit: Exit.Exit<void, unknown>
  /** Everything the command printed to stdout, one line per entry. */
  readonly out: string[]
  readonly err: string[]
}

let dir: string
let stdinIsTTY: boolean | undefined

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'edgy-cli-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// `confirmDestructive` refuses without a terminal, whatever runs the tests.
beforeEach(() => {
  stdinIsTTY = process.stdin.isTTY
  process.stdin.isTTY = false
})
afterEach(() => {
  process.stdin.isTTY = stdinIsTTY as boolean
  vi.restoreAllMocks()
})

/** Runs the real CLI over `args` against the SQLite file `db` and returns what it printed. */
const cli = async (db: string, ...args: string[]): Promise<Outcome> => {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')))

  const env = Layer.mergeAll(NodeServices.layer, ConfigLayer).pipe(
    Layer.provideMerge(
      ConfigProvider.layer(
        ConfigProvider.fromEnvRecord({
          DATABASE_PATH: join(dir, db),
          LOG_LEVEL: 'None',
          OTEL_SDK_DISABLED: 'true'
        })
      )
    )
  )
  const runtime = ManagedRuntime.make(env)
  const exit = await runtime.runPromiseExit(runWith(args))
  await runtime.dispose()
  vi.restoreAllMocks()
  return { exit, out, err }
}

const lines = (outcome: Outcome) => outcome.out.join('\n')

describe('migrate:status, migrate:up', () => {
  it('lists everything as pending on a fresh database, then as executed', async () => {
    const fresh = await cli('up.db', 'migrate:status')
    expect(lines(fresh)).toMatch(/Executed \(0\):\n {2}\(none\)\nPending \([1-9]\d*\):/)

    const up = await cli('up.db', 'migrate:up')
    expect(up.out.every((line) => line.startsWith('Success: '))).toBe(true)
    expect(up.out.length).toBeGreaterThan(0)

    const after = await cli('up.db', 'migrate:status')
    expect(lines(after)).toMatch(/Executed \([1-9]\d*\):\n {2}\S+ \(\d{4}-/)
    expect(lines(after)).toMatch(/Pending \(0\):\n {2}\(none\)/)
  })

  it('reports nothing to do on a second run', async () => {
    await cli('again.db', 'migrate:up')
    expect(lines(await cli('again.db', 'migrate:up'))).toBe('No pending migrations')
  })

  it('--dry-run lists the pending migrations without applying them', async () => {
    const dry = await cli('dry.db', 'migrate:up', '--dry-run')
    expect(lines(dry)).toMatch(/^\d+ pending migration\(s\) \(dry run, nothing applied\):/)
    expect(lines(await cli('dry.db', 'migrate:status'))).toMatch(/Executed \(0\)/)

    await cli('dry.db', 'migrate:up')
    expect(lines(await cli('dry.db', 'migrate:up', '--dry-run'))).toBe('No pending migrations')
  })

  it('--to stops at the named migration', async () => {
    const status = await cli('to.db', 'migrate:status')
    const [first] =
      lines(status)
        .match(/Pending \(\d+\):\n {2}(\S+)/)
        ?.slice(1) ?? []
    expect(first).toBeDefined()

    const up = await cli('to.db', 'migrate:up', '--to', first!)
    expect(up.out).toEqual([`Success: ${first}`])
    expect(lines(await cli('to.db', 'migrate:up', '--dry-run', '--to', first!))).toBe(
      'No pending migrations'
    )
  })
})

describe('migrate:up --to guards', () => {
  it('refuses a name that is not a migration', async () => {
    const outcome = await cli('guard.db', 'migrate:up', '--to', 'nope')
    expect(Exit.isFailure(outcome.exit)).toBe(true)
    expect(JSON.stringify(outcome.exit)).toContain('Unknown migration: nope')
    expect(lines(await cli('guard.db', 'migrate:status'))).toMatch(/Executed \(0\)/)
  })

  it('never rolls back: a target already applied is a no-op when nothing ran after it', async () => {
    const status = await cli('guard2.db', 'migrate:status')
    const names = [...lines(status).matchAll(/^ {2}(\S+)$/gm)].map((match) => match[1]!)
    await cli('guard2.db', 'migrate:up')
    const again = await cli('guard2.db', 'migrate:up', '--to', names.at(-1)!)
    expect(Exit.isSuccess(again.exit)).toBe(true)
    expect(lines(again)).toBe('No pending migrations')
  })
})

describe('migrate:down', () => {
  it('rejects a count below 1', async () => {
    const outcome = await cli('down.db', 'migrate:down', '--count', '0')
    expect(Exit.isFailure(outcome.exit)).toBe(true)
  })

  it('has nothing to roll back before anything ran, in a dry run and for real', async () => {
    expect(lines(await cli('down0.db', 'migrate:down', '--dry-run'))).toBe('Nothing to roll back')
    expect(lines(await cli('down0.db', 'migrate:down', '--force'))).toBe('Nothing to roll back')
  })

  it('names what it would roll back in a dry run, newest first, and changes nothing', async () => {
    await cli('down1.db', 'migrate:up')
    const dry = await cli('down1.db', 'migrate:down', '--dry-run')
    expect(lines(dry)).toMatch(/^1 migration\(s\) would be rolled back \(dry run\):\n {2}\S+$/)
    expect(lines(await cli('down1.db', 'migrate:status'))).toMatch(/Executed \([1-9]/)
  })

  it('refuses without --force when there is no terminal, and runs with it', async () => {
    await cli('down2.db', 'migrate:up')
    const refused = await cli('down2.db', 'migrate:down')
    expect(Exit.isFailure(refused.exit)).toBe(true)
    expect(JSON.stringify(refused.exit)).toContain('Refusing to run non-interactively')
    expect(lines(await cli('down2.db', 'migrate:status'))).toMatch(/Executed \([1-9]/)

    const forced = await cli('down2.db', 'migrate:down', '--force')
    expect(forced.out).toHaveLength(1)
    expect(forced.out[0]).toMatch(/^Success: \S+$/)
  })
})

describe('migrate:reset', () => {
  it('requires --up for --seed', async () => {
    const outcome = await cli('reset0.db', 'migrate:reset', '--seed', '--force')
    expect(Exit.isFailure(outcome.exit)).toBe(true)
    expect(outcome.out).toEqual([])
  })

  it('previews the rollback, the re-apply and the seeders in a dry run', async () => {
    expect(lines(await cli('reset1.db', 'migrate:reset', '--dry-run'))).toBe('Nothing to roll back')

    await cli('reset1.db', 'migrate:up')
    const dry = await cli('reset1.db', 'migrate:reset', '--dry-run', '--up', '--seed')
    expect(lines(dry)).toMatch(/would be rolled back \(dry run\):/)
    expect(lines(dry)).toMatch(/Then \d+ migration\(s\) would be re-applied/)
    expect(lines(dry)).toContain('Then these seeders would run: user_factory')
  })

  it('rolls everything back, and with --up --seed rebuilds and seeds', async () => {
    await cli('reset2.db', 'migrate:up')

    const down = await cli('reset2.db', 'migrate:reset', '--force')
    expect(lines(down)).toMatch(/^Rolled back [1-9]\d* migration\(s\)$/)
    expect(lines(await cli('reset2.db', 'migrate:status'))).toMatch(/Executed \(0\)/)

    const fresh = await cli('reset2.db', 'migrate:reset', '--force', '--up', '--seed')
    expect(lines(fresh)).toMatch(
      /Rolled back 0 migration\(s\)\nRe-applied [1-9]\d* migration\(s\)\nRunning seeders\.\.\.\nSeeders completed/
    )
  })

  it('refuses without --force when there is no terminal', async () => {
    await cli('reset3.db', 'migrate:up')
    const refused = await cli('reset3.db', 'migrate:reset')
    expect(Exit.isFailure(refused.exit)).toBe(true)
    expect(JSON.stringify(refused.exit)).toContain('Refusing to run non-interactively')
    expect(lines(await cli('reset3.db', 'migrate:status'))).toMatch(/Executed \([1-9]/)
  })
})

describe('migrate:seed', () => {
  it('lists the seeders in a dry run', async () => {
    expect(lines(await cli('seed0.db', 'migrate:seed', '--dry-run'))).toBe(
      'Seeders that would run (dry run, nothing seeded):\n  user_factory'
    )
  })

  it('seeds idempotently', async () => {
    await cli('seed1.db', 'migrate:up')
    expect(lines(await cli('seed1.db', 'migrate:seed'))).toBe('Seeders completed')
    expect(lines(await cli('seed1.db', 'migrate:seed'))).toBe('Seeders completed')
  })
})

describe('config:generate', () => {
  const target = (name: string) => join(dir, name)

  it('prints the file with --stdout', async () => {
    const outcome = await cli('cfg.db', 'config:generate', '--stdout')
    expect(outcome.out[0]).toMatch(/^# Generated by `pnpm app config:generate`/)
    expect(outcome.out[0]).toContain('DATABASE_PATH=')
  })

  it('writes the file, then reports it up to date', async () => {
    const file = target('example.env')
    const wrote = await cli('cfg.db', 'config:generate', '-o', file)
    expect(lines(wrote)).toMatch(/^Wrote .+ \(\d+ variables\)$/)
    expect(readFileSync(file, 'utf8')).toContain('DATABASE_PATH=')

    expect(lines(await cli('cfg.db', 'config:generate', '-o', file))).toMatch(
      /is already up to date$/
    )
  })

  it('--check passes when current, and fails when missing or stale', async () => {
    const file = target('check.env')
    const missing = await cli('cfg.db', 'config:generate', '--check', '-o', file)
    expect(Exit.isFailure(missing.exit)).toBe(true)

    await cli('cfg.db', 'config:generate', '-o', file)
    expect(lines(await cli('cfg.db', 'config:generate', '--check', '-o', file))).toMatch(
      /is up to date$/
    )

    writeFileSync(file, 'stale\n')
    const stale = await cli('cfg.db', 'config:generate', '--check', '-o', file)
    expect(Exit.isFailure(stale.exit)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('stale\n')
  })

  it('never writes a real dotenv file', async () => {
    for (const name of ['.env', '.ENV', '.env.local', '.env.production']) {
      const file = target(name)
      const outcome = await cli('cfg.db', 'config:generate', '-o', file)
      expect(Exit.isFailure(outcome.exit)).toBe(true)
      expect(() => readFileSync(file)).toThrow(/ENOENT/)
    }
  })

  it('replaces a differing file only with --overwrite', async () => {
    const file = target('replace.env')
    writeFileSync(file, 'mine\n')

    const plain = await cli('cfg.db', 'config:generate', '-o', file)
    expect(Exit.isFailure(plain.exit)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('mine\n')

    const declined = await cli('cfg.db', 'config:generate', '-o', file, '--overwrite')
    expect(Exit.isFailure(declined.exit)).toBe(true)
    expect(JSON.stringify(declined.exit)).toContain('Refusing to run non-interactively')
    expect(readFileSync(file, 'utf8')).toBe('mine\n')

    await cli('cfg.db', 'config:generate', '-o', file, '--overwrite', '--force')
    expect(readFileSync(file, 'utf8')).toContain('DATABASE_PATH=')
  })

  it('--force alone is a usage error', async () => {
    const outcome = await cli('cfg.db', 'config:generate', '--force', '-o', target('f.env'))
    expect(Exit.isFailure(outcome.exit)).toBe(true)
  })
})
