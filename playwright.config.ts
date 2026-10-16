import { defineConfig, devices } from '@playwright/test'
import { ENV } from './e2e/config.ts'

const address = new URL(ENV.baseURL)
const DATABASE = '.output/e2e/e2e.db'

/**
 * Browser tests against the production build: `pnpm build`, a fresh seeded database, then the
 * built server. A server already on the port is never reused, so a stale one cannot pass for it.
 */
export default defineConfig({
  testDir: 'e2e/screens',
  outputDir: '.output/e2e',
  reporter: [['list'], ['html', { outputFolder: '.output/e2e-result', open: 'never' }]],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: ENV.baseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } },
    { name: 'Safari', use: { ...devices['Desktop Safari'] } }
  ],
  // `E2E_BASE_URL` points the tests at a server that is already running.
  ...(process.env['E2E_BASE_URL']
    ? {}
    : {
        webServer: {
          command: [
            `rm -f ${DATABASE}*`,
            'pnpm -s build --minify',
            'node ./src/main.ts migrate:reset --up --seed --force',
            'node dist/server/index.mjs serve'
          ].join(' && '),
          url: new URL('/health', ENV.baseURL).href,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            HOST: address.hostname,
            PORT: address.port,
            DATABASE_DRIVER: 'sqlite',
            DATABASE_PATH: DATABASE,
            LOG_LEVEL: 'Warn',
            RATE_LIMIT_MAX: '100000',
            OTEL_SDK_DISABLED: 'true'
          }
        }
      })
})
