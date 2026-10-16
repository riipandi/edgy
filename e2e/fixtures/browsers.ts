import type { Browser, BrowserContext, BrowserType, Page } from 'playwright'
import { chromium, devices, firefox, webkit } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, inject } from 'vitest'

interface Target {
  readonly label: string
  readonly type: BrowserType
  readonly device?: string
}

const TARGETS: Readonly<Record<string, Target>> = {
  chromium: { label: 'Chromium', type: chromium },
  firefox: { label: 'Firefox', type: firefox },
  webkit: { label: 'Safari', type: webkit },
  mobile: { label: 'Mobile Chrome', type: chromium, device: 'Pixel 7' }
}

/** `E2E_BROWSER` is one of the names above, a comma-separated list, or `all`. Chromium by default. */
const selected = (): Target[] => {
  const wanted = process.env['E2E_BROWSER'] ?? 'chromium'
  const names =
    wanted === 'all' ? Object.keys(TARGETS) : wanted.split(',').map((name) => name.trim())
  return names.map((name) => {
    const target = TARGETS[name]
    if (target === undefined) throw new Error(`E2E_BROWSER: unknown browser "${name}"`)
    return target
  })
}

export interface Session {
  /** A page in a context of its own, closed after the test. */
  readonly open: () => Promise<Page>
  /** The server's address. */
  readonly url: (path: string) => string
}

/** Runs `define` once for each selected browser, sharing one browser process across its tests. */
export const describeBrowsers = (define: (session: Session) => void): void => {
  describe.each(selected())('$label', (target) => {
    let browser: Browser
    const contexts: BrowserContext[] = []

    beforeAll(async () => {
      browser = await target.type.launch({ headless: process.env['E2E_HEADED'] === undefined })
    })
    afterEach(async () => {
      await Promise.all(contexts.splice(0).map((context) => context.close()))
    })
    afterAll(async () => {
      await browser.close()
    })

    define({
      open: async () => {
        const options = target.device === undefined ? {} : devices[target.device]
        const context = await browser.newContext({ ...options, baseURL: inject('baseUrl') })
        contexts.push(context)
        return context.newPage()
      },
      url: (path) => new URL(path, inject('baseUrl')).href
    })
  })
}
