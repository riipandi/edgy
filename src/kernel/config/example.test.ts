import { it } from '@effect/vitest'
import { expect } from 'vite-plus/test'
import { renderExample } from './example.ts'

it('renders grouped config values with usable defaults', () => {
  const result = renderExample([
    {
      name: 'SERVER_HOST',
      description: 'HTTP listener address',
      kind: 'string',
      default: '0.0.0.0',
      section: 'Server'
    },
    {
      name: 'OTEL_EXPORTER_OTLP_HEADERS',
      description: 'OTLP request headers',
      kind: 'secret',
      default: 'authorization=edgy-dev-ingestion-key',
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

  expect(result).toContain(
    '# --- Server ---\n# HTTP listener address (string)\nSERVER_HOST=0.0.0.0'
  )
  expect(result).toContain('OTEL_EXPORTER_OTLP_HEADERS=authorization=edgy-dev-ingestion-key')
  expect(result).toContain('# Console output format (enum: pretty | json)\nLOG_FORMAT=pretty')
})

it('never renders a placeholder in place of a default', () => {
  const result = renderExample([
    {
      name: 'REDIS_URL',
      description: 'Redis connection URL',
      kind: 'string',
      default: 'redis://default:securedb@localhost:6379',
      section: 'Redis'
    }
  ])
  expect(result).not.toContain('<redacted>')
  expect(result).toContain('REDIS_URL=redis://default:securedb@localhost:6379')
})
