import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Plugin } from 'vite-plus'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { effectVite } from '#/builder/vite-plugin.ts'

const roots: Array<string> = []
const tempRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'edgy-plugin-'))
  roots.push(root)
  return root
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

interface BuiltEnvironment {
  resolve?: { noExternal?: boolean }
  build?: {
    outDir?: string
    emptyOutDir?: boolean
    minify?: boolean | string
    rolldownOptions?: {
      input?: unknown
      output?: {
        entryFileNames?: string
        chunkFileNames?: string
        codeSplitting?: { groups?: Array<{ name?: unknown; debugName?: string }> } | false
        assetFileNames?: (asset: { names: ReadonlyArray<string> }) => string
      }
    }
  }
}

interface ResolvedPluginConfig {
  environments?: Record<string, BuiltEnvironment>
}

interface PluginHooks {
  config?: (
    config: unknown,
    env: { command: string; mode: string }
  ) => ResolvedPluginConfig | undefined
  configResolved?: (config: { root: string }) => void
  buildStart?: () => void
  closeBundle?: (this: { environment?: { name?: string } }) => void
}

const hooks = (plugin: Plugin): Required<PluginHooks> => plugin as never

describe('the config hook', () => {
  it('returns nothing outside the build command or when disabled', () => {
    const plugin = effectVite({ enabled: true })
    expect(hooks(plugin).config({}, { command: 'serve', mode: 'dev' })).toBeUndefined()
    expect(
      hooks(effectVite({ enabled: false })).config({}, { command: 'build', mode: 'production' })
    ).toBeUndefined()
  })

  it('shapes the effect and ssr environments for a plain build', () => {
    const plugin = effectVite({ enabled: true })
    const config = hooks(plugin).config({}, { command: 'build', mode: 'production' })!
    const effect = config.environments!.effect!
    expect(effect.build!.outDir).toBe('dist')
    expect(effect.build!.emptyOutDir).toBe(false)
    expect(effect.build!.minify).toBe(false)
    const output = effect.build!.rolldownOptions!.output!
    expect(output.entryFileNames).toBe('entry.js')
    expect(output.chunkFileNames).toBe('chunks/[name]-[hash].js')
    expect(output.codeSplitting).toBe(false)
    expect(config.environments!.ssr).toEqual({})
  })

  it('inlines dependencies and splits vendor chunks in standalone mode', () => {
    const plugin = effectVite({ enabled: true })
    const config = hooks(plugin).config({}, { command: 'build', mode: 'standalone' })!
    const effect = config.environments!.effect!
    expect(effect.resolve!.noExternal).toBe(true)
    const output = effect.build!.rolldownOptions!.output!
    expect(output.codeSplitting).toMatchObject({
      groups: [{ debugName: 'package-chunks' }]
    })
    expect(config.environments!.ssr).toMatchObject({ resolve: { noExternal: true } })
  })

  it('routes the solid client assets to the client entry names', () => {
    const plugin = effectVite({ enabled: true })
    const config = hooks(plugin).config({}, { command: 'build', mode: 'production' })!
    const naming = config.environments!.client!.build!.rolldownOptions!.output!.assetFileNames!
    expect(naming({ names: ['virtual_solid:x'] } as never)).toBe(
      'assets/entry-client-[hash][extname]'
    )
    expect(naming({ names: ['other'] } as never)).toBe('assets/[name]-[hash][extname]')
  })
})

describe('buildStart', () => {
  it('removes stale artifacts from the dist directory', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    for (const stale of ['assets', 'chunks', 'node_modules']) {
      mkdirSync(path.join(dist, stale), { recursive: true })
      writeFileSync(path.join(dist, stale, 'old.js'), 'stale')
    }
    writeFileSync(path.join(dist, 'entry.js'), 'stale entry')

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).buildStart()

    expect(existsSync(path.join(dist, 'assets'))).toBe(false)
    expect(existsSync(path.join(dist, 'chunks'))).toBe(false)
    expect(existsSync(path.join(dist, 'node_modules'))).toBe(false)
    expect(existsSync(path.join(dist, 'entry.js'))).toBe(false)
  })
})

describe('closeBundle', () => {
  it('marks the entry executable', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    mkdirSync(dist, { recursive: true })
    const entry = path.join(dist, 'entry.js')
    writeFileSync(entry, 'export {}')
    chmodSync(entry, 0o644)

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).closeBundle.call({})

    expect(statSync(entry).mode & 0o777).toBe(0o755)
  })

  it('drops the duplicate stylex stylesheet with its directory', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    mkdirSync(path.join(dist, 'assets'), { recursive: true })
    writeFileSync(path.join(dist, 'assets', 'stylex.css'), 'styles')
    writeFileSync(path.join(dist, 'entry.js'), 'export {}')

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).closeBundle.call({})

    expect(existsSync(path.join(dist, 'assets'))).toBe(false)
    expect(existsSync(path.join(dist, 'entry.js'))).toBe(true)
  })

  it('fails the standalone build when the bundle leaks a bare import', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(path.join(dist, 'entry.js'), `import x from 'left-pad'\nexport default x\n`)

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).config({}, { command: 'build', mode: 'standalone' })
    expect(() => hooks(plugin).closeBundle.call({ environment: { name: 'effect' } })).toThrow(
      /leaked external imports/
    )
  })

  it('accepts a bare Node builtin specifier a dependency carried through unprefixed', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(
      path.join(dist, 'entry.js'),
      `import { createRequire } from 'module'\nexport default createRequire\n`
    )

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).config({}, { command: 'build', mode: 'standalone' })
    expect(() => hooks(plugin).closeBundle.call({ environment: { name: 'effect' } })).not.toThrow()
  })

  it('writes dist/oxfile.toml for a standalone build by default', () => {
    const root = tempRoot()
    const dist = path.join(root, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(path.join(dist, 'entry.js'), 'export {}')

    const plugin = effectVite({ enabled: true })
    hooks(plugin).configResolved({ root })
    hooks(plugin).config({}, { command: 'build', mode: 'standalone' })
    hooks(plugin).closeBundle.call({ environment: { name: 'effect' } })

    const oxfile = readFileSync(path.join(dist, 'oxfile.toml'), 'utf8')
    expect(oxfile).toContain('cluster_mode = true')
    expect(oxfile).toContain('command = "node entry.js serve"')
    expect(oxfile).not.toContain('--auto-migrate')
  })
})
