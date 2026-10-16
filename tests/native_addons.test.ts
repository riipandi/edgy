import { afterAll, describe, expect, it } from '@effect/vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findNativeAddons, nativeAddonMessage } from '../builder/native.ts'

const dir = mkdtempSync(path.join(tmpdir(), 'native-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A project whose `node_modules` holds `packages` (name to manifest and extra files). */
const project = (
  name: string,
  dependencies: string[],
  packages: Record<string, { manifest?: object; files?: string[] }>
): string => {
  const root = path.join(dir, name)
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: Object.fromEntries(dependencies.map((d) => [d, '*'])) })
  )
  for (const [pkg, { manifest = {}, files = [] }] of Object.entries(packages)) {
    const base = path.join(root, 'node_modules', pkg)
    mkdirSync(base, { recursive: true })
    writeFileSync(path.join(base, 'package.json'), JSON.stringify({ name: pkg, ...manifest }))
    for (const file of files) {
      mkdirSync(path.dirname(path.join(base, file)), { recursive: true })
      writeFileSync(path.join(base, file), '')
    }
  }
  return root
}

describe('findNativeAddons', () => {
  it('finds nothing in pure JavaScript', () => {
    const root = project('pure', ['a'], { a: { manifest: { dependencies: { b: '*' } } }, b: {} })
    expect(findNativeAddons(root)).toEqual([])
  })

  it.each([
    ['binding.gyp', {}, ['binding.gyp']],
    ['gypfile', { gypfile: true }, []],
    ['a prebuilt .node file', {}, ['prebuilds/linux-x64/addon.node']]
  ])('finds a package with %s', (label, manifest, files) => {
    const root = project(`direct-${label}`, ['native'], { native: { manifest, files } })
    expect(findNativeAddons(root)).toEqual(['native'])
  })

  it('finds an addon behind a dependency of a dependency', () => {
    const root = project('transitive', ['a'], {
      a: { manifest: { dependencies: { b: '*' } } },
      b: { files: ['build/Release/b.node'] }
    })
    expect(findNativeAddons(root)).toEqual(['b'])
  })

  it('ignores devDependencies and survives a dependency cycle', () => {
    const root = project('cycle', ['a'], {
      a: { manifest: { dependencies: { b: '*' } } },
      b: { manifest: { dependencies: { a: '*' } } }
    })
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { a: '*' }, devDependencies: { tool: '*' } })
    )
    mkdirSync(path.join(root, 'node_modules', 'tool'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules', 'tool', 'binding.gyp'), '')
    writeFileSync(path.join(root, 'node_modules', 'tool', 'package.json'), '{}')
    expect(findNativeAddons(root)).toEqual([])
  })

  it('finds none in this project', () => {
    expect(findNativeAddons(process.cwd())).toEqual([])
  })
})

describe('nativeAddonMessage', () => {
  it('names the packages', () => {
    expect(nativeAddonMessage(['a', 'b'])).toContain('a, b')
  })
})
