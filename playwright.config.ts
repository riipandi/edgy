import { defineConfig, devices } from '@playwright/test'
import { ENV } from './e2e/config.ts'

const address = new URL(ENV.baseURL)
const dev = new URL(ENV.devURL)
const HOT_RELOAD = /hot-reload\.spec\.ts$/
const DATABASE = '.output/e2e/e2e.db'
const DEV_DATABASE = '.output/e2e/dev.db'
const serverEnv = {
  DATABASE_DRIVER: 'sqlite',
  LOG_LEVEL: 'Warn',
  RATE_LIMIT_MAX: '100000',
  OTEL_SDK_DISABLED: 'true'
}

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
    { name: 'Chromium', testIgnore: HOT_RELOAD, use: { ...devices['Desktop Chrome'] } },
    { name: 'Firefox', testIgnore: HOT_RELOAD, use: { ...devices['Desktop Firefox'] } },
    { name: 'Mobile Chrome', testIgnore: HOT_RELOAD, use: { ...devices['Pixel 7'] } },
    { name: 'Safari', testIgnore: HOT_RELOAD, use: { ...devices['Desktop Safari'] } },
    // The development server, which the others do not touch: it edits a source file.
    {
      name: 'Dev',
      testMatch: HOT_RELOAD,
      use: { ...devices['Desktop Chrome'], baseURL: ENV.devURL }
    }
  ],
  // `E2E_BASE_URL` points the tests at a production server that is already running.
  webServer: [
    ...(process.env['E2E_BASE_URL']
      ? []
      : [
          {
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
              ...serverEnv,
              HOST: address.hostname,
              PORT: address.port,
              DATABASE_PATH: DATABASE
            }
          }
        ]),
    {
      command: `rm -f ${DEV_DATABASE}* && pnpm -s dev`,
      url: new URL('/health', ENV.devURL).href,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...serverEnv,
        HOST: dev.hostname,
        PORT: dev.port,
        DATABASE_PATH: DEV_DATABASE,
        DATABASE_AUTO_MIGRATE: 'true'
      }
    }
  ]
})
