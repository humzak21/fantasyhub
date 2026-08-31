import { defineConfig, devices } from '@playwright/test'

/**
 * One smoke spec, two viewports, against the real built bundle.
 *
 * This exists because of a specific gap: jsdom has no layout engine, so the
 * vitest suite cannot observe width-dependent behaviour at all — and six test
 * files in this repo used to *claim* to, by assigning `window.innerWidth` and
 * asserting things that were true at every width. They passed while the second
 * team button in Pick'Ems was off-screen and unclickable.
 *
 * Scope is deliberately small: load each route, assert the page does not
 * scroll horizontally, keep a screenshot as an artifact. No pixel-diff
 * baselines, no axe run, no Storybook — none of that is proportionate here,
 * and a flaky gate gets ignored, which is worse than no gate.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'off',
  },

  projects: [
    {
      // iPhone SE: the narrowest screen worth supporting, and the one every
      // fixed-width bug in this codebase showed up on first.
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: false },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --host 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
