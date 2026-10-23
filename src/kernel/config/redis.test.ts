import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { parseRedisUrl, redisDatabases, redisUrlFor, redisUrlForDatabase } from './redis.ts'

describe('redisUrlFor', () => {
  it('sets the database index on the path', () => {
    expect(redisUrlFor('redis://localhost:6379', 1)).toBe('redis://localhost:6379/1')
  })

  it('keeps credentials, host, and port', () => {
    expect(redisUrlFor('redis://user:pass@cache.internal:6380', 2)).toBe(
      'redis://user:pass@cache.internal:6380/2'
    )
  })

  it('replaces an index already present in the URL', () => {
    expect(redisUrlFor('redis://localhost:6379/9', 1)).toBe('redis://localhost:6379/1')
  })

  it('keeps the rediss scheme', () => {
    expect(redisUrlFor('rediss://secure.example.com', 1)).toBe('rediss://secure.example.com/1')
  })
})

describe('redis databases', () => {
  it('gives each consumer its own index', () => {
    expect(redisDatabases.cache).not.toBe(redisDatabases.rateLimit)
    expect(redisUrlForDatabase('redis://localhost:6379', 'cache')).toBe('redis://localhost:6379/1')
    expect(redisUrlForDatabase('redis://localhost:6379', 'rateLimit')).toBe(
      'redis://localhost:6379/2'
    )
  })
})

it('rejects a non-redis URL', async () => {
  await expect(Effect.runPromise(parseRedisUrl('http://localhost'))).rejects.toThrow(/redis:\/\//)
})
