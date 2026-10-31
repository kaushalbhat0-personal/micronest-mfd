# MFD-64 P0 — Capacitor remote-shell notes

Remote-shell only. No static export. No `output: export`. No `webDir` bundle.

## Shell

- `capacitor.config.ts`: `appId com.micronest.app`, `appName MicroNest`,
  `webDir public` (placeholder — the shell loads the remote URL),
  `server.url` = production by default.
- Dev override: `CAP_SERVER_URL=https://<preview-or-lan-url> npx cap sync`
  and `NEXT_PUBLIC_WEB_BASE_URL` (in-app link base) for preview testing.
- `android/` + `ios/` are generated native projects (committed per review).

## Native deep link (OAuth)

- Scheme: `micronest://auth/callback` only (Android intent-filter in
  `AndroidManifest.xml`, `CFBundleURLTypes` in `Info.plist`).
- Required dashboard updates (NOT done in this change — do at enablement):
  - Supabase Dashboard → Auth → URL Configuration → Redirect URLs: add
    `micronest://auth/callback` (keep existing HTTPS web URLs).
  - Google Cloud → OAuth client → Authorized redirect URIs: add the
    Supabase callback (unchanged) — Supabase then redirects to the native
    scheme; no Google-side custom scheme needed beyond Supabase config.
- Web flow untouched: `window.location.origin/auth/callback` + cookie 302.

## Boundaries

- `lib/native/runtime.ts` — `isNative()` gate. Everything native-only branches here.
- `lib/native/links.ts` — URL classification (internal / tel / whatsapp /
  external-allowed / blocked). Unknown HTTPS is blocked by default.
- `lib/native/auth.ts` — deep-link parse, `safeNativeNextPath` (reuses
  `lib/auth/guard.ts`), single-claim code idempotency, native redirectTo.
- `lib/native/session-store.ts` — Preferences-backed Supabase storage,
  `persistSession/autoRefreshToken` on, `detectSessionInUrl` off.
- `lib/native/provider.tsx` — single `appUrlOpen`/resume/click-interception point.
- `lib/native/guard.tsx` — native-only `/workspace` session guard.
- `lib/native/files.ts` — Filesystem+Share download bridge, Clipboard
  fallback, file-picker compat constants (limits unchanged).
