import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { resolveDistRoot } from '#/kernel/renderer.ts'

const roots: string[] = []
const scratch = (label: string): string => {
  const root = mkdtempSync(path.join(tmpdir(), `edgy-dist-root-${label}-`))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('resolveDistRoot', () => {
  it('finds the built bundle from the source layout', () => {
    const root = scratch('source')
    mkdirSync(path.join(root, 'src/kernel'), { recursive: true })
    mkdirSync(path.join(root, 'dist/server'), { recursive: true })
    writeFileSync(path.join(root, 'dist/server/server.js'), '')

    expect(resolveDistRoot(path.join(root, 'src/kernel'))).toBe(path.join(root, 'dist'))
  })

  it('finds the bundle from inside the built layout', () => {
    const root = scratch('bundled')
    mkdirSync(path.join(root, 'dist/server'), { recursive: true })
    writeFileSync(path.join(root, 'dist/server/server.js'), '')

    expect(resolveDistRoot(path.join(root, 'dist/server'))).toBe(path.join(root, 'dist'))
  })

  it('answers undefined when no bundle exists up the tree', () => {
    const root = scratch('missing')
    mkdirSync(path.join(root, 'src/kernel'), { recursive: true })

    expect(resolveDistRoot(path.join(root, 'src/kernel'))).toBeUndefined()
  })
})
