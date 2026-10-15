import { type ChildProcess, spawn } from 'node:child_process'
import { watch } from 'node:fs'

/** Reports each changed file (relative to the directory) until closed. Replaceable in tests. */
export type Watch = (
  dir: string,
  onChange: (file: string) => void,
  onError: (message: string) => void
) => { readonly close: () => void }

const fileSystemWatch: Watch = (dir, onChange, onError) => {
  const watcher = watch(dir, { recursive: true }, (_event, name) => {
    onChange(name ?? '')
  })
  // A watcher that fails later (too many files open) must not take the session down with it.
  watcher.on('error', (error) => onError(error.message))
  return watcher
}

export interface SupervisorOptions {
  /** The script to run, which is started with Node. */
  readonly entry: string
  /** Its arguments. */
  readonly args: readonly string[]
  /** Directory whose changes restart it, recursively. */
  readonly watchDir: string
  /** Paths (relative to `watchDir`) whose changes are not worth a restart. */
  readonly ignore?: (file: string) => boolean
  /** Changes arriving within this many milliseconds make one restart. Default 150. */
  readonly debounceMs?: number
  /** How long a child gets to stop after `SIGTERM` before it is killed. Default 10 000. */
  readonly stopTimeoutMs?: number
  readonly log?: (message: string) => void
  /** Where changes come from; the file system unless a test says otherwise. */
  readonly watch?: Watch
  /** Called once, when the supervisor is done: the exit code to use. */
  readonly onExit: (code: number) => void
}

export interface Supervisor {
  /** Stops the child (gracefully) and the watcher, then calls `onExit`. */
  readonly stop: (signal?: NodeJS.Signals) => void
}

/**
 * Runs a script and runs it again when files under a directory change: the loop of `pnpm dev`.
 *
 * Node's own `--watch` is not used because it also watches what the program *imports*, and a Vite
 * dev server writes and rewrites files (its configuration bundle, dependency caches) in places it
 * imports from: the program saw its own tooling change and restarted forever. Watching one
 * directory the developer edits, and nothing else, cannot loop.
 *
 * - A change stops the child with `SIGTERM` (its own graceful shutdown), waits, and starts a new
 *   one. A child that will not stop is killed after `stopTimeoutMs`.
 * - A child that exits with `0` ends the supervisor: it was a command that finished (`--help`, a
 *   migration), not a server. One that fails waits for the next change, like Node's watch mode,
 *   so a typo does not end the session.
 * - A signal to the supervisor goes to the child, and the supervisor ends when it does.
 */
export const supervise = (options: SupervisorOptions): Supervisor => {
  const log = options.log ?? (() => undefined)
  const debounceMs = options.debounceMs ?? 150
  const stopTimeoutMs = options.stopTimeoutMs ?? 10_000

  let child: ChildProcess | undefined
  let restarting = false
  let stopping = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let finished = false

  const finish = (code: number) => {
    if (finished) return
    finished = true
    clearTimeout(debounce)
    watcher?.close()
    options.onExit(code)
  }

  const start = () => {
    const running = spawn(process.execPath, [options.entry, ...options.args], {
      stdio: 'inherit'
    })
    child = running
    running.once('exit', (code, signal) => {
      child = undefined
      if (stopping) return finish(code ?? (signal === null ? 0 : 1))
      if (restarting) {
        restarting = false
        return start()
      }
      if (code === 0) return finish(0)
      log(`exited with ${code ?? signal}; waiting for a change to try again`)
    })
  }

  const restart = (file: string) => {
    if (stopping || finished) return
    if (child === undefined) {
      log(`${file} changed, starting`)
      start()
      return
    }
    if (restarting) return
    log(`${file} changed, restarting`)
    restarting = true
    const running = child
    running.kill('SIGTERM')
    setTimeout(() => {
      if (child === running) running.kill('SIGKILL')
    }, stopTimeoutMs).unref()
  }

  let watcher: { readonly close: () => void } | undefined
  try {
    watcher = (options.watch ?? fileSystemWatch)(
      options.watchDir,
      (file) => {
        if (file !== '' && options.ignore?.(file) === true) return
        clearTimeout(debounce)
        debounce = setTimeout(() => restart(file || options.watchDir), debounceMs)
      },
      (message) => log(`not watching any more: ${message}`)
    )
  } catch (error) {
    log(`not watching: ${error instanceof Error ? error.message : String(error)}`)
  }

  start()

  return {
    stop: (signal = 'SIGTERM') => {
      if (stopping || finished) return
      stopping = true
      if (child === undefined) return finish(0)
      child.kill(signal)
    }
  }
}
