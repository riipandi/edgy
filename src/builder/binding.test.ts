import { readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { copyNativeBinding } from './binding.ts'

const directories: Array<string> = []
const tempDir = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgy-binding-'))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.length = 0
})

const withPlatform = (platform: string, arch: string, run: () => void): void => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')
  Object.defineProperty(process, 'platform', { value: platform })
  Object.defineProperty(process, 'arch', { value: arch })
  try {
    run()
  } finally {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
    if (originalArch) Object.defineProperty(process, 'arch', originalArch)
  }
}

describe('the native binding resolver', () => {
  it('rejects a platform the turso engine does not ship a binding for', () => {
    withPlatform('sunos', 'x64', () => {
      expect(() => copyNativeBinding(tempDir())).toThrowError(/no native binding for sunos-x64/)
    })
  })

  it("copies this platform's binding into dist so the bundle runs standalone", () => {
    const dist = tempDir()
    copyNativeBinding(dist)
    // The copy is dereferenced: a real package directory lands in dist.
    const copied = path.join(dist, 'node_modules', '@tursodatabase')
    const binding = `database-${process.platform}-${process.arch}`
    expect(readdirSync(copied).some((name) => name.startsWith(binding))).toBe(true)
    const installed = readdirSync(copied).find((name) => name.startsWith(binding))
    expect(readdirSync(path.join(copied, installed ?? ''))).toContain('package.json')
  })
})
