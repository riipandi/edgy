import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('GET /health', () => {
  it('shares one database round trip between probes within a second', async () => {
    t = await makeTestApp({ LOG_LEVEL: 'Trace', RATE_LIMIT_ENABLED: 'false' })
    const probes = () => t!.logs.filter((line) => line.includes('select 1')).length
    const before = probes()

    const answers = await Promise.all(Array.from({ length: 20 }, () => t!.request('/health')))
    expect(answers.map((answer) => answer.status)).toEqual(Array(20).fill(200))
    expect(probes() - before).toBe(1)
  })
})
