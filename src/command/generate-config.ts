import { Command } from 'effect/cli'
import { appConfig } from '../kernel/config/config.ts'
import { renderExample } from '../kernel/config/example.ts'
import { generatedFileFlags, writeGenerated } from './generated.ts'

const isRealDotenv = (name: string): boolean =>
  /^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== '.env.example'

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
