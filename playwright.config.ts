import { defineConfig, devices } from '@playwright/test';

// E2E proti POSTAVENÉ appce (`vite preview`): stránky dostanou hlavičky z public/_headers (CSP), Worker běží z dist/mzdy
// s lokální D1 a DEV_BYPASS z .dev.vars (platí jen na localhost). Testy si zakládají vlastní firmu a na konci ji smažou.
const PORT = 5299;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Oba projekty sdílejí jednu lokální databázi a jeden server: po sobě, ne souběžně.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    acceptDownloads: true,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Rozměry, dotykové ovládání a mobilní režim iPhonu 14, ale v Chromiu (stačí jeden nainstalovaný prohlížeč).
    { name: 'mobil', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run db:migrate:local && npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/zdravi`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
