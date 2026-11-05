import { defineConfig } from '@playwright/test';

// Assumes `npm run dev` (server :8787, TV :5173, phone :5174) is running, or set NOIR_E2E_TV/PHONE.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  use: {
    viewport: { width: 1920, height: 1080 },
    // --no-proxy-server: talk to the LAN directly even when the shell has an HTTP(S) proxy configured.
    launchOptions: { args: ['--no-proxy-server'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) },
  },
  reporter: 'list',
});
