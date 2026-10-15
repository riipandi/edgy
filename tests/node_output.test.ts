import { describe, expect, it } from '@effect/vitest'
import { chmodSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeExecutable, packageManifest } from '../builder/output.ts'

describe('makeExecutable', () => {
  it('makes the entry of a built Node server executable', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-'))
    writeFileSync(path.join(dir, 'index.mjs'), '#!/usr/bin/env node\nconsole.log("hello")\n')
    chmodSync(path.join(dir, 'index.mjs'), 0o644)

    expect(makeExecutable(dir)).toBe(true)
    expect(statSync(path.join(dir, 'index.mjs')).mode & 0o777).toBe(0o755)
  })

  it('leaves a Worker build alone: the platform loads its entry, nothing runs it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'worker-'))
    writeFileSync(path.join(dir, 'index.js'), 'export default {}\n')

    expect(makeExecutable(dir)).toBe(false)
    expect(statSync(path.join(dir, 'index.js')).mode & 0o111).toBe(0)
  })
})

describe('packageManifest', () => {
  it('makes the directory a valid Node project that starts at index.mjs', () => {
    expect(JSON.parse(packageManifest())).toMatchObject({ type: 'module', main: './index.mjs' })
  })
})
