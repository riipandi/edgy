import { defineConfig, devices } from '@playwright/test'
import { ENV } from './e2e/config.ts'

const address = new URL(ENV.baseURL)

const serverEnv = {
  DATABASE_DRIVER: 'sqlite',
  DATABASE_PATH: '.output/e2e/e2e.db',
  DATABASE_AUTO_MIGRATE: 'true',
  LOG_LEVEL: 'Warn',
  OTEL_SDK_DISABLED: 'true',
  RATE_LIMIT_MAX: '100000'
}

export default defineConfig({
  testDir: 'e2e/screens',
  testMatch: '**/*.spec.ts',
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
  // `E2E_BASE_URL` points the tests at a production server that is already running.
  webServer: process.env['E2E_BASE_URL']
    ? []
    : [
        {
          command: [
            'vpr build --mode standalone --minify',
            'node --env-file-if-exists=.env.local dist/entry.js migrate:up',
            'node --env-file-if-exists=.env.local dist/entry.js migrate:seed',
            'node --env-file-if-exists=.env.local dist/entry.js serve'
          ].join(' && '),
          url: new URL('/', ENV.baseURL).href,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...serverEnv,
            HOST: address.hostname,
            PORT: address.port
          }
        }
      ]
})
