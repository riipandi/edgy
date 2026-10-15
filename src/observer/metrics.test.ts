import { describe, expect, it } from '@effect/vitest'
import { metricMethod } from './metrics.ts'

describe('metricMethod', () => {
  it('keeps the standard methods', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(metricMethod(method)).toBe(method)
    }
  })

  it('folds anything else into one label, so a client cannot mint time series', () => {
    const labels = new Set(['get', 'PURGE', 'X'.repeat(500), 'BREW', ''].map(metricMethod))
    expect([...labels]).toEqual(['OTHER'])
  })
})
