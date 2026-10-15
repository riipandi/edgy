import { describe, expect, it } from '@effect/vitest'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { supervise, type Watch } from '../builder/supervisor.ts'

const child = path.join(import.meta.dirname, 'fixtures', 'dev_child.ts')

/** A temp directory to watch, and the file the fake child notes its starts in. */
const sandbox = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'supervisor-'))
  const watched = path.join(dir, 'src')
  mkdirSync(watched)
  const note = path.join(dir, 'starts.log')
  writeFileSync(note, '')
  process.env['DEV_CHILD_LOG'] = note
  return { watched, starts: () => readFileSync(note, 'utf8').trim().split('\n').filter(Boolean) }
}

/** A watcher the test drives by hand: the file system's own is not what is being tested. */
const manualWatch = () => {
  let notify: (file: string) => void = () => undefined
  const watch: Watch = (_dir, onChange) => {
    notify = onChange
    return { close: () => undefined }
  }
  return { watch, change: (file: string) => notify(file) }
}

const until = async (done: () => boolean, ms = 8000) => {
  const deadline = Date.now() + ms
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('dev supervisor', { timeout: 20_000 }, () => {
  it('starts the child again when a watched file changes, and only then', async () => {
    const { watched, starts } = sandbox()
    let exitCode: number | undefined
    const logs: string[] = []
    const { watch, change } = manualWatch()
    const supervisor = supervise({
      entry: child,
      args: ['serve'],
      watchDir: watched,
      watch,
      debounceMs: 20,
      log: (message) => logs.push(message),
      onExit: (code) => (exitCode = code)
    })
    try {
      await until(() => starts().length === 1)
      expect(starts()).toEqual(['start serve'])

      // Nothing changed yet: still one start.
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(starts()).toHaveLength(1)

      change('a.ts')
      await until(() => starts().length === 2)
      expect(logs.some((line) => line.includes('restarting'))).toBe(true)

      // Several writes at once are one restart.
      for (const name of ['b.ts', 'c.ts', 'd.ts']) change(name)
      await until(() => starts().length === 3)
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(starts()).toHaveLength(3)
    } finally {
      supervisor.stop()
    }
    await until(() => exitCode !== undefined)
  })

  it('leaves ignored files alone', async () => {
    const { watched, starts } = sandbox()
    let exitCode: number | undefined
    const { watch, change } = manualWatch()
    const supervisor = supervise({
      entry: child,
      args: [],
      watchDir: watched,
      watch,
      debounceMs: 20,
      ignore: (file) => file.endsWith('.test.ts'),
      onExit: (code) => (exitCode = code)
    })
    try {
      await until(() => starts().length === 1)
      change('nested/a.test.ts')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(starts()).toHaveLength(1)
    } finally {
      supervisor.stop()
    }
    await until(() => exitCode !== undefined)
  })

  it('ends with the child when it finishes successfully, like a command that is not a server', async () => {
    const { watched } = sandbox()
    let exitCode: number | undefined
    supervise({
      entry: child,
      args: ['--exit'],
      watchDir: watched,
      watch: manualWatch().watch,
      onExit: (code) => (exitCode = code)
    })
    await until(() => exitCode !== undefined)
    expect(exitCode).toBe(0)
  })

  it('waits for the next change after a failure instead of ending the session', async () => {
    const { watched, starts } = sandbox()
    let exitCode: number | undefined
    const logs: string[] = []
    const { watch, change } = manualWatch()
    const supervisor = supervise({
      entry: child,
      args: ['--fail'],
      watchDir: watched,
      watch,
      debounceMs: 20,
      log: (message) => logs.push(message),
      onExit: (code) => (exitCode = code)
    })
    try {
      await until(() => logs.some((line) => line.includes('waiting for a change')))
      expect(exitCode).toBeUndefined()

      change('fix.ts')
      await until(() => starts().length === 2)
    } finally {
      supervisor.stop()
    }
    await until(() => exitCode !== undefined)
  })
})

describe('dev supervisor with the real file system', () => {
  it('restarts on a real file change', async () => {
    const { watched, starts } = sandbox()
    // Some sandboxes refuse to watch (EMFILE); the supervisor says so and carries on, which is
    // all there is to check there.
    const problems: string[] = []
    let exitCode: number | undefined
    const supervisor = supervise({
      entry: child,
      args: [],
      watchDir: watched,
      debounceMs: 20,
      log: (message) => problems.push(message),
      onExit: (code) => (exitCode = code)
    })
    try {
      await until(() => starts().length === 1)
      await new Promise((resolve) => setTimeout(resolve, 300))
      const watching = !problems.some((line) => line.includes('not watching'))
      if (watching) appendFileSync(path.join(watched, 'real.ts'), 'x')
      await until(() => starts().length === (watching ? 2 : 1))
      expect(starts()).toHaveLength(watching ? 2 : 1)
    } finally {
      supervisor.stop()
    }
    await until(() => exitCode !== undefined)
  }, 20_000)
})
