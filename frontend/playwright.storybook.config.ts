import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'

export default defineConfig({
  testDir: './tests/storybook',
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'off',
  },
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
})

