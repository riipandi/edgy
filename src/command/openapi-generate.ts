import { Effect } from 'effect'
import { Command } from 'effect/cli'
import pkg from '../../package.json' with { type: 'json' }
import { renderOpenApi } from '../kernel/http/openapi_document.ts'
import { generatedFileFlags, writeGenerated } from './generated.ts'

/**
 * Writes the OpenAPI description of the `/api` routes, derived from the schemas the handlers
 * declare, so it cannot drift from the code. `--check` fails when the file is stale (CI runs it).
 */
export const openapiGenerateCmd = Command.make(
  'openapi:generate',
  generatedFileFlags('docs/openapi.json', ''),
  (options) =>
    Effect.suspend(() =>
      writeGenerated({
        ...options,
        content: renderOpenApi(pkg.version),
        regenerate: 'pnpm app openapi:generate'
      })
    )
).pipe(Command.withDescription('Generate the OpenAPI description of the API'))
