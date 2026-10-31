import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MFD-64 P0 — Capacitor remote-shell foundation.
 *
 * REMOTE URL SHELL ONLY. No local webDir bundle, no `output: export`.
 * The native app loads the deployed Next.js application; all auth cookies,
 * proxy.ts protection, and route handlers keep running on Vercel.
 *
 * Dev override: set CAP_SERVER_URL (or NEXT_PUBLIC_WEB_BASE_URL at build
 * time for in-app links) to point the shell at a preview/local server.
 * Never commit secrets here.
 */
const serverUrl =
  process.env.CAP_SERVER_URL ?? "https://micronestmicrotools.vercel.app";

const config: CapacitorConfig = {
  appId: "com.micronest.app",
  appName: "MicroNest",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: false,
    // Allow the remote app origin to navigate inside the WebView.
    allowNavigation: ["micronestmicrotools.vercel.app"],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
