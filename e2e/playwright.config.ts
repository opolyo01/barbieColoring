import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Auto-start dev servers when not already running.
  // Prerequisite: docker-compose up -d  (Postgres must be running for the server to start)
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: true,
      timeout: 30_000,
      env: { NODE_ENV: 'development' },
    },
    {
      command: 'npm run dev',
      cwd: '../client',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
