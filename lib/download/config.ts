/**
 * Android app distribution channel — single source of truth for the
 * marketing download CTA.
 *
 * Current channel: direct APK during early access (NOT Google Play).
 * Later this same abstraction serves the Play Store URL without rewriting
 * the marketing CTA components.
 */

/** Display version of the distributed APK. Keep in sync with the Android versionName at release time. */
export const ANDROID_APP_VERSION = "1.0.0";

/**
 * Intended stable asset URL once the v1.0.0 GitHub Release is published.
 * Documented here so the release asset can be named to match; it is NOT
 * used as a fallback — an unconfigured destination renders no CTA rather
 * than a link that 404s.
 */
export const INTENDED_GITHUB_APK_URL =
  "https://github.com/kaushalbhat0-personal/micronest-mfd/releases/latest/download/MicroNest-Android.apk";

export type AndroidDownloadChannel = "direct-apk" | "play-store";

export interface AndroidDownload {
  url: string;
  channel: AndroidDownloadChannel;
  version: string;
}

/**
 * Returns the configured Android download, or null when not configured.
 * Configure with NEXT_PUBLIC_ANDROID_APK_URL (full https URL to the APK
 * asset). Null means the CTA renders nothing — production never shows a
 * broken or placeholder download action.
 */
export function getAndroidDownload(): AndroidDownload | null {
  const raw = process.env.NEXT_PUBLIC_ANDROID_APK_URL;
  if (!raw || raw.trim().length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return { url: parsed.toString(), channel: "direct-apk", version: ANDROID_APP_VERSION };
}
