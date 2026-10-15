import { describe, expect, it } from '@effect/vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { finishBuild } from '../builder/plugin_build.ts'
import { parseObfuscate } from '../builder/postprocess.ts'

const CODE = 'const greet = (name) => `hello ${name}`\nconsole.log(greet("world"))\n'

/** A directory shaped like a Node build: an entry with a shebang, a chunk, and browser assets. */
const nodeBuild = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-'))
  mkdirSync(path.join(dir, 'chunks'))
  mkdirSync(path.join(dir, 'public', 'assets'), { recursive: true })
  writeFileSync(path.join(dir, 'index.mjs'), `#!/usr/bin/env node\n${CODE}`)
  chmodSync(path.join(dir, 'index.mjs'), 0o644)
  writeFileSync(path.join(dir, 'chunks', 'a.js'), CODE)
  writeFileSync(path.join(dir, 'public', 'assets', 'app.js'), CODE)
  return dir
}

const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8')

describe('finishBuild for a Node server', () => {
  it('makes the entry executable and gives the directory a package.json', () => {
    const dir = nodeBuild()
    const done = finishBuild({ serverDir: dir, obfuscate: false })

    expect(done).toEqual({ obfuscated: 0, executable: true })
    expect(statSync(path.join(dir, 'index.mjs')).mode & 0o777).toBe(0o755)
    expect(JSON.parse(read(dir, 'package.json'))).toMatchObject({
      type: 'module',
      main: './index.mjs'
    })
    expect(read(dir, 'index.mjs')).toBe(`#!/usr/bin/env node\n${CODE}`)
  })

  it('obfuscates the server code, keeps the shebang and the executable bit, and leaves the browser assets alone', () => {
    const dir = nodeBuild()
    const done = finishBuild({ serverDir: dir, obfuscate: 'medium' })

    expect(done).toEqual({ obfuscated: 2, executable: true })
    expect(read(dir, 'index.mjs').startsWith('#!/usr/bin/env node\n')).toBe(true)
    // `medium` encodes the strings, so the readable text is gone.
    expect(read(dir, 'index.mjs')).not.toContain('hello')
    expect(read(dir, 'chunks', 'a.js')).not.toContain('hello')
    expect(read(dir, 'public', 'assets', 'app.js')).toBe(CODE)
    expect(statSync(path.join(dir, 'index.mjs')).mode & 0o777).toBe(0o755)
  })
})

describe('finishBuild for a Worker', () => {
  it('has nothing to make executable and no package.json to write', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'worker-'))
    writeFileSync(path.join(dir, 'index.js'), CODE)
    const done = finishBuild({ serverDir: dir, obfuscate: false })

    expect(done).toEqual({ obfuscated: 0, executable: false })
    expect(statSync(path.join(dir, 'index.js')).mode & 0o111).toBe(0)
    expect(() => readFileSync(path.join(dir, 'package.json'))).toThrow(/ENOENT/)
  })
})

describe('parseObfuscate', () => {
  it('reads a preset, true as medium, and off for anything that means off', () => {
    expect(parseObfuscate('high')).toBe('high')
    expect(parseObfuscate('true')).toBe('medium')
    expect(parseObfuscate('1')).toBe('medium')
    for (const off of [undefined, '', 'false', '0']) expect(parseObfuscate(off)).toBe(false)
  })

  it('refuses a typo instead of shipping readable code', () => {
    expect(() => parseObfuscate('mediun')).toThrow(/not one of/)
  })
})
