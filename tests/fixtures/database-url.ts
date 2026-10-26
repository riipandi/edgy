import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The driver has no in-memory mode, so every fixture gets a throwaway file in
// one per-process directory, removed when the process exits.
const directory = mkdtempSync(join(tmpdir(), 'edgy-test-db-'))
process.once('exit', () => rmSync(directory, { recursive: true, force: true }))

/** An absolute path to a fresh database file inside this process's temp directory. */
export const testDatabasePath = (name: string): string => join(directory, name)

/** The same file as the `file:` URI the configuration accepts. */
export const testDatabaseUrl = (name: string): string => `file:${testDatabasePath(name)}`
