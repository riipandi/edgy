import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { parseBaseUrl } from './app.ts'

const resolved = (value: string) => Effect.runPromise(parseBaseUrl(value))

describe('APP_BASE_URL', () => {
  it('keeps the origin and drops a trailing path', async () => {
    await expect(resolved('https://edgy.example.com')).resolves.toBe('https://edgy.example.com')
    await expect(resolved('https://edgy.example.com/some/path')).resolves.toBe(
      'https://edgy.example.com'
    )
  })

  it('keeps a non-default port and trims surrounding space', async () => {
    await expect(resolved('  http://localhost:8080  ')).resolves.toBe('http://localhost:8080')
  })

  it('rejects a relative or non-http value', async () => {
    await expect(resolved('/relative')).rejects.toThrow(/not an absolute URL/)
    await expect(resolved('ftp://example.com')).rejects.toThrow(/must use http or https/)
  })

  it('rejects an empty value', async () => {
    await expect(resolved('')).rejects.toThrow(/absolute http\(s\) URL/)
    await expect(resolved('   ')).rejects.toThrow(/absolute http\(s\) URL/)
  })
})
