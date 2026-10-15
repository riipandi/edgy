import { afterEach, describe, expect, it } from '@effect/vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { type InlineConfig, resolveConfig } from 'vite'

const root = path.resolve(import.meta.dirname, '..')

const resolve = (inline: InlineConfig = {}, command: 'build' | 'serve' = 'serve') =>
  resolveConfig(
    {
      root,
      configFile: path.join(root, 'vite.config.ts'),
      configLoader: 'runner',
      logLevel: 'silent',
      ...inline
    },
    command
  )

const names = (config: Awaited<ReturnType<typeof resolve>>) =>
  config.plugins.map((plugin) => plugin.name)

const saved = { host: process.env['HOST'], port: process.env['PORT'] }
afterEach(() => {
  for (const [key, value] of [
    ['HOST', saved.host],
    ['PORT', saved.port]
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('vite.config.ts', () => {
  it('owns where the dev server and the preview listen: one address, and no silent port change', async () => {
    // The address comes from `.env.local`; only that it is one strict address is asserted.
    const config = await resolve()

    expect(config.server.strictPort).toBe(true)
    expect(config.preview.strictPort).toBe(true)
    expect(config.preview.host).toBe(config.server.host)
    expect(config.preview.port).toBe(config.server.port)
  })

  it('takes HOST and PORT from the environment, as the Node server does', async () => {
    process.env['HOST'] = '0.0.0.0'
    process.env['PORT'] = '3456'
    const config = await resolve()

    expect(config.server).toMatchObject({ host: '0.0.0.0', port: 3456 })
    expect(config.preview).toMatchObject({ host: '0.0.0.0', port: 3456 })
  })

  it('lets the command line override it, as on any Vite project', async () => {
    const config = await resolve({ server: { port: 4040 } })
    expect(config.server.port).toBe(4040)
  })

  it('lets settings made outside the plugin win over its defaults', async () => {
    const config = await resolve(
      { environments: { ssr: { build: { outDir: 'somewhere-else', target: 'node22' } } } },
      'build'
    )
    const ssr = config.environments['ssr']?.build

    expect(ssr?.outDir).toBe('somewhere-else')
    expect(ssr?.target).toBe('node22')
    // ...while what was not set stays the plugin's.
    expect(config.environments['client']?.build.outDir).toBe('dist/server/public')
  })
})

describe('the platform', () => {
  it('is the Node server by default: the dev server in `vite`, the output step in `vite build`', async () => {
    expect(names(await resolve())).toEqual(expect.arrayContaining(['edgy:node', 'edgy:dev-server']))
    const build = await resolve({}, 'build')
    expect(names(build)).toEqual(expect.arrayContaining(['edgy:node', 'edgy:node-output']))
    expect(names(build)).not.toContain('edgy:dev-server')
    expect(build.environments['ssr']?.build.outDir).toBe('dist/server')
  })

  it('is the Worker with --mode worker, and then only the Worker', () => {
    // Runs in its own process with Vite's config loader: the Cloudflare plugin is loaded lazily,
    // which the test runner's loader does not support.
    const script = `
      import { resolveConfig } from 'vite'
      const config = await resolveConfig({ root: ${JSON.stringify(root)}, mode: 'worker', logLevel: 'silent' }, 'build')
      console.log(JSON.stringify({
        names: config.plugins.map((plugin) => plugin.name),
        server: config.environments.ssr.build.outDir,
        client: config.environments.client.build.outDir
      }))
    `
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
      // Wrangler writes its own notices to stderr (proxy warnings, its log file); they are not the test's.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
    })
    const answer: { names: string[]; server: string; client: string } = JSON.parse(
      out.split('\n').findLast((line) => line.startsWith('{')) ?? '{}'
    )

    expect(answer.names).toEqual(
      expect.arrayContaining(['edgy:worker', 'edgy:worker-release-external'])
    )
    expect(answer.names).not.toContain('edgy:node')
    expect(answer.server).toBe('dist/worker')
    expect(answer.client).toBe('dist/worker/public')
  }, 60_000)
})
