import { Command } from 'effect/cli'
import { renderExample } from '../kernel/config/example.ts'
import { appConfig } from '../kernel/config/service.ts'
import { generatedFileFlags, writeGenerated } from './generated.ts'

/** Real dotenv files hold secrets and local overrides, so they are never written. */
const isRealDotenv = (name: string): boolean =>
  /^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== '.env.example'

/**
 * Writes `.env.example` from the declarations the parser reads, so the two cannot drift.
 * Replacing a differing file needs `--overwrite` and a confirmation (`--force` skips the prompt).
 * `--check` writes nothing and fails when the file is missing or stale, for a pre-commit hook or CI.
 */
export const configGenerateCmd = Command.make(
  'config:generate',
  generatedFileFlags('.env.example', 'never a real .env file'),
  (options) =>
    writeGenerated({
      ...options,
      content: renderExample(appConfig.specs),
      regenerate: 'pnpm app config:generate',
      refuse: (name) => (isRealDotenv(name) ? 'real dotenv files are never generated' : undefined),
      summary: `${appConfig.specs.length} variables`
    })
).pipe(Command.withDescription('Generate .env.example from the application configuration'))
