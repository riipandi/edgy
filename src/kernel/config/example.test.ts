import { it } from '@effect/vitest'
import { expect } from 'vite-plus/test'
import { renderExample } from './example.ts'

it('renders grouped config values without exposing secret defaults', () => {
  const result = renderExample([
    {
      name: 'HOST',
      description: 'HTTP listener address',
      kind: 'string',
      default: '0.0.0.0',
      section: 'Server'
    },
    {
      name: 'OTEL_EXPORTER_OTLP_HEADERS',
      description: 'OTLP request headers',
      kind: 'secret',
      default: '<redacted>',
      section: 'Observability'
    },
    {
      name: 'LOG_FORMAT',
      description: 'Console output format',
      kind: 'enum',
      default: 'pretty',
      choices: ['pretty', 'json'],
      section: 'Logging'
    }
  ])

  expect(result).toContain('# --- Server ---\n# HTTP listener address (string)\nHOST=0.0.0.0')
  expect(result).toContain('OTEL_EXPORTER_OTLP_HEADERS=<redacted>')
  expect(result).toContain('# Console output format (enum: pretty | json)\nLOG_FORMAT=pretty')
  expect(result).not.toContain('authorization=')
})
