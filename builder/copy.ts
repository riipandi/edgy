import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Recursively copies a file or directory, creating parents as needed. */
export const copyPath = (source: string, destination: string): void => {
  mkdirSync(path.dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, dereference: true, force: true })
}

/** Writes a file, creating parent directories as needed. */
export const writeText = (file: string, contents: string): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
}
