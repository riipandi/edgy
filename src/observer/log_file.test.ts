import * as NodeServices from '@effect/platform-node/NodeServices'
import { afterAll, describe, expect, it } from '@effect/vitest'
import { Effect, ManagedRuntime } from 'effect'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type LogEntry, type LogFileOptions, makeRotatingFile, rotationStamp } from './log_file.ts'

const at = (iso: string): number => Date.parse(iso)

describe('rotationStamp', () => {
  it('names the period in UTC', () => {
    const instant = at('2026-10-15T09:30:00Z')
    expect(rotationStamp(instant, 'hourly')).toBe('20261015_09')
    expect(rotationStamp(instant, 'daily')).toBe('20261015')
    expect(rotationStamp(instant, 'monthly')).toBe('202610')
  })

  it('names a week by its Monday, across month and year boundaries', () => {
    // 2026-10-15 is a Thursday; its Monday is the 12th.
    expect(rotationStamp(at('2026-10-15T09:30:00Z'), 'weekly')).toBe('20261012')
    expect(rotationStamp(at('2026-10-12T00:00:00Z'), 'weekly')).toBe('20261012')
    expect(rotationStamp(at('2026-10-18T23:59:59Z'), 'weekly')).toBe('20261012')
    expect(rotationStamp(at('2026-10-19T00:00:00Z'), 'weekly')).toBe('20261019')
    // Sunday 2027-01-03 belongs to the week of Monday 2026-12-28.
    expect(rotationStamp(at('2027-01-03T12:00:00Z'), 'weekly')).toBe('20261228')
  })

  it('changes exactly at the boundary', () => {
    expect(rotationStamp(at('2026-10-15T23:59:59.999Z'), 'daily')).not.toBe(
      rotationStamp(at('2026-10-16T00:00:00.000Z'), 'daily')
    )
  })
})

describe('makeRotatingFile', () => {
  const runtime = ManagedRuntime.make(NodeServices.layer)
  const directories: string[] = []
  afterAll(async () => {
    await runtime.dispose()
    for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  })

  const scratch = () => {
    const directory = mkdtempSync(join(tmpdir(), 'edgy-rotate-'))
    directories.push(directory)
    return directory
  }

  const write = (options: LogFileOptions, batches: ReadonlyArray<ReadonlyArray<LogEntry>>) =>
    runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const writer = yield* makeRotatingFile(options)
          for (const batch of batches) yield* writer.write(batch)
        })
      )
    )

  const entry = (iso: string, line: string): LogEntry => ({ at: at(iso), line })

  it('writes each period to its own file, named from the base path', async () => {
    const directory = scratch()
    const path = join(directory, 'nested', 'edgy.jsonl')

    await write({ path, rotation: 'daily', maxFiles: 0 }, [
      [entry('2026-10-15T10:00:00Z', 'a'), entry('2026-10-15T11:00:00Z', 'b')],
      [entry('2026-10-16T00:00:01Z', 'c')]
    ])

    const names = readdirSync(join(directory, 'nested')).sort()
    expect(names).toEqual(['edgy_20261015.jsonl', 'edgy_20261016.jsonl'])
    expect(readFileSync(join(directory, 'nested', names[0] ?? ''), 'utf8')).toBe('a\nb\n')
    expect(readFileSync(join(directory, 'nested', names[1] ?? ''), 'utf8')).toBe('c\n')
  })

  it('splits one batch that straddles a boundary, keeping order', async () => {
    const directory = scratch()
    const path = join(directory, 'edgy.jsonl')

    await write({ path, rotation: 'hourly', maxFiles: 0 }, [
      [
        entry('2026-10-15T09:59:59.9Z', 'before'),
        entry('2026-10-15T10:00:00.1Z', 'after-1'),
        entry('2026-10-15T10:00:00.2Z', 'after-2')
      ]
    ])

    expect(readFileSync(join(directory, 'edgy_20261015_09.jsonl'), 'utf8')).toBe('before\n')
    expect(readFileSync(join(directory, 'edgy_20261015_10.jsonl'), 'utf8')).toBe(
      'after-1\nafter-2\n'
    )
  })

  it('appends when the same period is opened again', async () => {
    const directory = scratch()
    const path = join(directory, 'edgy.jsonl')
    const options: LogFileOptions = { path, rotation: 'daily', maxFiles: 0 }

    await write(options, [[entry('2026-10-15T01:00:00Z', 'first')]])
    await write(options, [[entry('2026-10-15T02:00:00Z', 'second')]])

    expect(readFileSync(join(directory, 'edgy_20261015.jsonl'), 'utf8')).toBe('first\nsecond\n')
  })

  it('keeps only the newest maxFiles of its own files, and touches nothing else', async () => {
    const directory = scratch()
    const path = join(directory, 'edgy.jsonl')
    for (const other of [
      'edgy.jsonl',
      'edgy_notes.jsonl',
      'other_20200101.jsonl',
      'edgy_20200101.log'
    ]) {
      writeFileSync(join(directory, other), 'keep me')
    }
    writeFileSync(join(directory, 'edgy_20260101.jsonl'), 'old')
    writeFileSync(join(directory, 'edgy_20260102.jsonl'), 'old')

    await write({ path, rotation: 'daily', maxFiles: 2 }, [
      [entry('2026-10-14T00:00:00Z', 'x')],
      [entry('2026-10-15T00:00:00Z', 'y')]
    ])

    expect(readdirSync(directory).sort()).toEqual([
      'edgy.jsonl',
      'edgy_20200101.log',
      'edgy_20261014.jsonl',
      'edgy_20261015.jsonl',
      'edgy_notes.jsonl',
      'other_20200101.jsonl'
    ])
  })

  it('keeps every file when maxFiles is 0', async () => {
    const directory = scratch()
    const path = join(directory, 'edgy.jsonl')
    writeFileSync(join(directory, 'edgy_20200101.jsonl'), 'old')

    await write({ path, rotation: 'daily', maxFiles: 0 }, [[entry('2026-10-15T00:00:00Z', 'y')]])

    expect(existsSync(join(directory, 'edgy_20200101.jsonl'))).toBe(true)
  })
})
