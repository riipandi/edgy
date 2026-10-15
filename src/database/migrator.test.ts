import { describe, expect, it } from '@effect/vitest'
import { NO_MIGRATIONS } from 'kysely/migration'
import { rollbackTarget } from './migrator.ts'

describe('rollbackTarget', () => {
  const applied = ['001_a', '002_b', '003_c']

  it('stops at the migration just before the ones being rolled back', () => {
    expect(rollbackTarget(applied, 1)).toBe('002_b') // rolls back 003_c only
    expect(rollbackTarget(applied, 2)).toBe('001_a') // rolls back 003_c and 002_b
  })

  it('rolls everything back when the steps cover every applied migration', () => {
    expect(rollbackTarget(applied, 3)).toBe(NO_MIGRATIONS)
    expect(rollbackTarget(applied, 10)).toBe(NO_MIGRATIONS)
    expect(rollbackTarget(['001_a'], 1)).toBe(NO_MIGRATIONS)
  })

  it('does nothing when there is nothing to roll back', () => {
    expect(rollbackTarget([], 1)).toBeUndefined()
    expect(rollbackTarget(applied, 0)).toBeUndefined()
    expect(rollbackTarget(applied, -1)).toBeUndefined()
  })
})
