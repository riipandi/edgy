import { describe, expect, it } from '@effect/vitest'
import { migratesInDev } from '../src/dev.ts'

describe('migratesInDev', () => {
  it('migrates when the variable is not set at all, so a fresh checkout needs no step', () => {
    expect(migratesInDev(false, {})).toBe(true)
  })

  it('migrates when asked to', () => {
    expect(migratesInDev(true, { DATABASE_AUTO_MIGRATE: 'true' })).toBe(true)
  })

  it('does not migrate when the operator set it to false', () => {
    expect(migratesInDev(false, { DATABASE_AUTO_MIGRATE: 'false' })).toBe(false)
  })
})
