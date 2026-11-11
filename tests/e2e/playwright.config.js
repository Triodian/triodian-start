// Runs the real Worker locally (wrangler dev, local D1) against a stand-in Atlas (tests/atlas/stub.mjs, built from the
// Atlas's own routing table) and tests it through the browser and the API. Sign-in is simulated with the X-Dev-User
// header, which the app honours only on localhost (lib/identity).
import { defineConfig } from '@playwright/test';

const PORT = 8790, ATLAS = 8898;
export const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: BASE, viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure', launchOptions: { executablePath: process.env.CHROME_PATH || undefined } },
  webServer: [{
    cwd: '../..',
    command: `node tests/atlas/stub.mjs ${ATLAS}`,
    url: `http://localhost:${ATLAS}/healthz`,
    timeout: 30_000,
    reuseExistingServer: false,
  }, {
    cwd: '../..',
    command: [
      'node tests/e2e/node_modules/wrangler/bin/wrangler.js dev',
      `--port ${PORT} --ip 127.0.0.1 --local-upstream localhost`,
      '--persist-to tests/e2e/.state',
      '--var LOCAL_DEV_NO_SIGNIN_EMAIL:ana@coastline.example',
      `--var ATLAS_URL:http://localhost:${ATLAS}`,
      // Try first (task 5.8) on, with a test-only key, and the worked examples sent to the stand-in so no real app is reached.
      '--var SUITE_DEMO:on --var DEMO_SESSION_KEY:test-only-demo-key-0123456789abcdef',
      `--var TRY_BASE_URL:http://localhost:${ATLAS}/apps`,
      // The three ways to sign in, as a site would set them (lib/identity/methods.js).
      '--var SIGN_IN_METHODS:google,github,email',
      // Invitations (task 5.6): sending is off here, so the browser test shows what the page says then; the server
      // tests (tests/provision.test.mjs) cover sending.
      '--var NOTIFY_SENDING:off',
      '--show-interactive-dev-session=false',
    ].join(' '),
    url: `${BASE}/`,
    timeout: 120_000,
    reuseExistingServer: false,
  }],
});
