import { defineConfig, devices } from "@playwright/test";

/**
 * Auth modes for the E2E web server (Phase 14):
 * - default: Supabase vars forced empty → proxy passes through, the full
 *   session-local suite (radar/follow-ups/studio) runs unmodified.
 * - SUPABASE_E2E=dummy: syntactically-present but invalid credentials →
 *   session lookup fails closed and /tools/client-radar really redirects to
 *   /login. Run only e2e/auth.spec.ts in this mode; suites needing the
 *   session-local UI require the default mode.
 * Never point E2E at real credentials; real OAuth is manual-only.
 */
const dummyAuth = process.env.SUPABASE_E2E === "dummy";

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
    reuseExistingServer: !process.env.CI && !dummyAuth,
    timeout: 120_000,
    env: dummyAuth
      ? {
          NEXT_PUBLIC_SUPABASE_URL: "https://e2e-invalid.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-dummy-key",
        }
      : {
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        },
  },
});
