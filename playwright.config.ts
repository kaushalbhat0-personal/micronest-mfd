import { defineConfig, devices } from "@playwright/test";

/**
 * Auth modes for the E2E web server (Phase 14):
 * - default: Supabase vars forced empty → proxy passes through, the full
 *   session-local suite (radar/follow-ups/studio) runs unmodified.
 * - SUPABASE_E2E=dummy: syntactically-present but invalid credentials →
 *   session lookup fails closed and /tools/client-radar really redirects to
 *   /login. Run only e2e/auth.spec.ts in this mode; suites needing the
 *   session-local UI require the default mode.
 * - SUPABASE_E2E=stub: real test-project credentials from SUPABASE_TEST_URL /
 *   SUPABASE_TEST_ANON_KEY, plus server-only SUPABASE_TEST_SERVICE_ROLE_KEY
 *   exposed to the server as SUPABASE_E2E_SERVICE_ROLE_KEY. Enables the
 *   /api/e2e/auth stub login for authenticated suites (e2e/radar-persisted).
 *   Never point E2E at real credentials; real OAuth is manual-only.
 * Never commit any of these values.
 */
const dummyAuth = process.env.SUPABASE_E2E === "dummy";
const stubAuth = process.env.SUPABASE_E2E === "stub";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI && !dummyAuth && !stubAuth,
    timeout: 120_000,
    env: dummyAuth
      ? {
          NEXT_PUBLIC_SUPABASE_URL: "https://e2e-invalid.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-dummy-key",
        }
      : stubAuth
        ? {
            NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? "",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? "",
            SUPABASE_E2E: "stub",
            SUPABASE_E2E_SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "",
          }
        : {
            NEXT_PUBLIC_SUPABASE_URL: "",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          },
  },
});
