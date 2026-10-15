import JavaScriptObfuscator from 'javascript-obfuscator'
import type { ObfuscatorOptions } from 'javascript-obfuscator'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { BuilderConfig } from './config.ts'

/**
 * Obfuscator presets, ordered from safest to most aggressive.
 *
 * `low` keeps runtime behaviour closest to the source; `high` adds control-flow
 * flattening, dead-code injection and self-defending code, at the cost of a
 * much larger bundle and slower startup.
 */
const OBFUSCATOR_PRESETS: Record<BuilderConfig['obfuscatePreset'], ObfuscatorOptions> = {
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

/** Result of the optional post-processing pass. */
export interface PostProcessResult {
  readonly obfuscated: readonly string[]
}

/**
 * Post-processes emitted bundles.
 *
 * Minification is handled by Vite itself and is applied during
 * {@link runBuild}. This step only covers **obfuscation**, which runs
 * `javascript-obfuscator` over each emitted server file.
 *
 * Obfuscation happens *after* bundling on purpose: scrambling the whole chunk
 * renames far more than obfuscating module by module would.
 *
 * Both steps are opt-in — `config.minify` and `config.obfuscate` default to
 * `false`, so a plain `pnpm build:node` emits readable code.
 */
export const postProcess = (options: {
  readonly config: BuilderConfig
  /** Absolute paths of the server files. */
  readonly files: readonly string[]
}): PostProcessResult => {
  const { config, files } = options
  if (!config.obfuscate) return { obfuscated: [] }

  const preset = OBFUSCATOR_PRESETS[config.obfuscatePreset]
  const obfuscated: string[] = []

  for (const file of files) {
    const absolute = path.resolve(config.rootDir, file)

    const result = JavaScriptObfuscator.obfuscate(readFileSync(absolute, 'utf8'), {
      ...preset,
      sourceMap: false
    })

    writeFileSync(absolute, result.getObfuscatedCode())
    obfuscated.push(path.relative(config.rootDir, absolute))
  }

  return { obfuscated }
}
