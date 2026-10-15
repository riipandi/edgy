import JavaScriptObfuscator from 'javascript-obfuscator'
import type { ObfuscatorOptions } from 'javascript-obfuscator'
import { readFileSync, writeFileSync } from 'node:fs'

/** How hard to obfuscate: `low` keeps runtime behaviour closest to the source, `high` the least. */
export type ObfuscatePreset = 'low' | 'medium' | 'high'

/**
 * Obfuscator presets, ordered from safest to most aggressive.
 *
 * `low` keeps runtime behaviour closest to the source; `high` adds control-flow
 * flattening, dead-code injection and self-defending code, at the cost of a
 * much larger bundle and slower startup.
 */
const OBFUSCATOR_PRESETS: Record<ObfuscatePreset, ObfuscatorOptions> = {
  low: {
    compact: true,
    stringArray: true,
    identifierNamesGenerator: 'hexadecimal'
  },
  medium: {
    compact: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    identifierNamesGenerator: 'hexadecimal'
  },
  high: {
    compact: true,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    identifierNamesGenerator: 'hexadecimal',
    selfDefending: true
  }
}

/**
 * Reads `OBFUSCATE`: `low`, `medium` or `high` pick a preset, `true` and `1` mean `medium`, and
 * anything else (unset, `false`, `0`) means off. A typo fails loudly: shipping readable code
 * because a preset was misspelled is the wrong way to find out.
 */
export const parseObfuscate = (value: string | undefined): ObfuscatePreset | false => {
  if (value === undefined || value === '' || value === 'false' || value === '0') return false
  if (value === 'true' || value === '1') return 'medium'
  if (value === 'low' || value === 'medium' || value === 'high') return value
  throw new Error(`OBFUSCATE="${value}" is not one of: low, medium, high, true, false`)
}

/**
 * Obfuscates files in place with `javascript-obfuscator`. It runs *after* bundling on purpose:
 * scrambling the whole bundle renames far more than obfuscating module by module would. The
 * shebang of the Node entry survives (the obfuscator keeps a leading `#!` line).
 */
export const obfuscateFiles = (files: readonly string[], preset: ObfuscatePreset): void => {
  for (const file of files) {
    const result = JavaScriptObfuscator.obfuscate(readFileSync(file, 'utf8'), {
      ...OBFUSCATOR_PRESETS[preset],
      sourceMap: false
    })
    writeFileSync(file, result.getObfuscatedCode())
  }
}
