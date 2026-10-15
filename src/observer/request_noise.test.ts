import { afterEach, describe, expect, it, vi } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { MISSING_USER_ID } from '../../tests/ids.ts'

let t: TestApp | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await t?.dispose()
  t = undefined
})

/** The request log lines the app printed while `run` ran. */
const logged = async (level: string, run: (app: TestApp) => Promise<void>): Promise<string[]> => {
  t = await makeTestApp({ LOG_LEVEL: level })
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  await run(t)
  return lines
}

const get = (app: TestApp, ...paths: string[]) =>
  Promise.all(paths.map((path) => app.request(path)))

describe('request log noise', () => {
  it('keeps noise out of the log at Info', async () => {
    const lines = await logged('Info', async (app) => {
      await get(
        app,
        '/favicon.ico',
        '/robots.txt',
        '/.well-known/appspecific/com.chrome.devtools.json'
      )
      await get(app, '/wp-login.php', '/.env', '/health')
    })
    expect(lines).toEqual([])
  })

  it('still logs a real request and a real 404', async () => {
    const lines = await logged('Info', async (app) => {
      await get(app, '/api/users', `/api/users/${MISSING_USER_ID}`, '/nope')
    })
    expect(lines.some((line) => line.includes('INFO') && line.includes('GET /api/users 200'))).toBe(
      true
    )
    expect(
      lines.some(
        (line) => line.includes('WARN') && line.includes(`GET /api/users/${MISSING_USER_ID} 404`)
      )
    ).toBe(true)
    expect(lines.some((line) => line.includes('WARN') && line.includes('GET /nope 404'))).toBe(true)
  })

  it('brings the noise back, saying why, at Debug', async () => {
    const lines = await logged('Debug', async (app) => {
      await get(app, '/favicon.ico', '/wp-login.php')
    })
    const favicon = lines.find((line) => line.includes('GET /favicon.ico 404'))
    expect(favicon).toContain('DEBUG')
    expect(favicon).toContain('quiet=browser')
    expect(lines.find((line) => line.includes('GET /wp-login.php 404'))).toContain('quiet=scanner')
  })

  it('does not quiet a probe that fails', async () => {
    const lines = await logged('Info', async (app) => {
      app.http.beginDrain()
      expect((await app.request('/health')).status).toBe(503)
    })
    expect(lines.some((line) => line.includes('WARN') && line.includes('GET /health 503'))).toBe(
      true
    )
  })
})

describe('request metrics noise', () => {
  const read = async (app: TestApp, pattern: RegExp): Promise<number> =>
    Number(pattern.exec(await (await app.request('/metrics')).text())?.[1] ?? 0)

  it('counts a probe but leaves it out of the latency histogram', async () => {
    t = await makeTestApp({ METRICS_ENABLED: 'true' })
    const count = () => read(t!, /^http_requests_total\{method="GET",status="200"\} (\d+)/m)
    const timed = () =>
      read(t!, /^http_request_duration_ms_count\{method="GET",status="200"\} (\d+)/m)

    const [countBefore, timedBefore] = [await count(), await timed()]
    await get(t, '/health', '/health', '/health')
    // The /metrics scrape itself is a probe too, so only /health's three could differ.
    expect((await count()) - countBefore).toBeGreaterThanOrEqual(3)
    expect(await timed()).toBe(timedBefore)

    await get(t, '/api/users')
    expect(await timed()).toBe(timedBefore + 1)
  })

  it('still counts and times a scanner 404, which is a signal', async () => {
    t = await makeTestApp({ METRICS_ENABLED: 'true' })
    const timed = () =>
      read(t!, /^http_request_duration_ms_count\{method="GET",status="404"\} (\d+)/m)
    const before = await timed()
    await get(t, '/wp-login.php', '/.env')
    expect(await timed()).toBe(before + 2)
  })
})
