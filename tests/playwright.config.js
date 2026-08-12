import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:18080', browserName: 'chromium' },
  webServer: {
    command:
      'npm run build && SCAD_LIVE_BIND=127.0.0.1 SCAD_LIVE_PORT=18080 cargo run -- tests/fixtures',
    cwd: '..',
    url: 'http://127.0.0.1:18080/api/models',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
