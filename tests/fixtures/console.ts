// Application compositions under test log through the console; the runner
// output must stay clean. A test that asserts on log lines captures them with
// a capturing `Logger` (see tests/fixtures/api.ts, src/command/cli.ts); a
// composition whose fibers log outside any provided logger — the dev-server
// forwarding, the serve command's listening fiber — leaks lines in the
// platform's own format. `quietConsole` drops exactly those records from the
// process streams and leaves every other write alone.

const COMPOSITION_LOG_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:FATAL|ERROR|WARN|INFO|DEBUG|TRACE)\s/
const DEFAULT_EFFECT_LOG_LINE =
  /^\[\d{2}:\d{2}:\d{2}\.\d{3}\]\s+(?:FATAL|ERROR|WARN|INFO|DEBUG|TRACE)\s+\(#\d+\)/
const JSON_LOG_LINE = /^\{"timestamp":"[^"]*","level":/

const isAppLog = (line: string): boolean =>
  COMPOSITION_LOG_LINE.test(line) || DEFAULT_EFFECT_LOG_LINE.test(line) || JSON_LOG_LINE.test(line)

type Write = (chunk: unknown, callback?: (error?: Error) => void) => boolean

const hook = (stream: NodeJS.WriteStream): (() => void) => {
  const originalWrite = stream.write.bind(stream) as (
    chunk: string | Uint8Array,
    callback?: (error?: Error) => void
  ) => boolean
  const filtered: Write = (chunk: unknown, callback?: (error?: Error) => void) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? String(chunk) : ''
    // A record's lines travel in one write; the first line decides, and the
    // callback fires so a producer resuming on it never stalls.
    if (isAppLog(text.split('\n', 1)[0] ?? '')) {
      if (typeof callback === 'function') callback()
      return true
    }
    return originalWrite(chunk as string | Uint8Array, callback)
  }
  stream.write = filtered as typeof stream.write
  return () => {
    stream.write = originalWrite as typeof stream.write
  }
}

/** Drops application log records from the process streams; returns the restore fn. */
export const quietConsole = (): (() => void) => {
  const restoreStdout = hook(process.stdout)
  const restoreStderr = hook(process.stderr)
  return () => {
    restoreStdout()
    restoreStderr()
  }
}

/** Runs the body with application log records filtered from the process streams. */
export const withQuietConsole = async <A>(run: () => Promise<A>): Promise<A> => {
  const restore = quietConsole()
  try {
    return await run()
  } finally {
    restore()
  }
}
