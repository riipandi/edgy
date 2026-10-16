import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

const root = path.resolve(import.meta.dirname, '../..')

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0))
    })
  })

const waitFor = async (url: string, exited: Promise<number | null>): Promise<void> => {
  const state = { over: false }
  void exited.then(() => {
    state.over = true
  })
  const deadline = Date.now() + 30_000
  while (!state.over && Date.now() < deadline) {
    if (
      await fetch(url).then(
        (response) => response.ok,
        () => false
      )
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`the server did not answer ${url}`)
}

/**
 * Starts the production build against a fresh seeded database and hands its address to the tests.
 * `E2E_BASE_URL` skips all of that and tests a server that is already running.
 */
export default async function setup(project: TestProject): Promise<() => void> {
  const external = process.env['E2E_BASE_URL']
  if (external !== undefined) {
    project.provide('baseUrl', external)
    return () => undefined
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'edgy-e2e-'))
  mkdirSync(dir, { recursive: true })
  const port = await freePort()
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_DRIVER: 'sqlite',
    DATABASE_PATH: path.join(dir, 'e2e.db'),
    LOG_LEVEL: 'Warn',
    RATE_LIMIT_MAX: '100000',
    OTEL_SDK_DISABLED: 'true'
  }

  const run = (file: string, args: string[]) => {
    return execFileSync(file, args, { cwd: root, env, stdio: 'inherit' })
  }

  run('pnpm', ['-s', 'build'])
  run(process.execPath, ['./src/main.ts', 'migrate:up'])
  run(process.execPath, ['./src/main.ts', 'migrate:seed'])

  const server: ChildProcess = spawn(process.execPath, ['dist/server/index.mjs', 'serve'], {
    cwd: root,
    env,
    stdio: 'inherit'
  })
  const exited = new Promise<number | null>((resolve) => server.once('exit', resolve))
  const url = `http://127.0.0.1:${port}`
  try {
    await waitFor(`${url}/health`, exited)
  } catch (error) {
    server.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
    throw error
  }

  project.provide('baseUrl', url)
  return () => {
    server.kill('SIGTERM')
    rmSync(dir, { recursive: true, force: true })
  }
}

declare module 'vitest' {
  interface ProvidedContext {
    baseUrl: string
  }
}
