import { buttonClasses } from "@/components/ui/button";
import { PhoneIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { getAndroidDownload } from "@/lib/download/config";

/**
 * Early-access Android download strip for the marketing homepage.
 *
 * Renders nothing until NEXT_PUBLIC_ANDROID_APK_URL is configured, so
 * production never exposes a broken or placeholder download action.
 * Same-tab navigation: GitHub Release assets serve with a download
 * disposition, so desktop and Android both save the APK; the copy makes
 * clear this is an Android-only direct APK (no store badges by design).
 */
export function AndroidAppCta() {
  const download = getAndroidDownload();
  if (!download) return null;

  return (
    <section
      aria-labelledby="android-app-heading"
      className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:p-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="eyebrow flex items-center gap-1.5">
          <PhoneIcon aria-hidden="true" className="h-3.5 w-3.5" />
          Android app · Early access
        </p>
        <h2
          id="android-app-heading"
          className="text-lg font-semibold tracking-tight text-stone-900"
        >
          MicroNest on your Android phone
        </h2>
        <p className="text-sm leading-relaxed text-stone-600">
          Install the MicroNest app directly on Android. Direct APK · MicroNest v
          {download.version} · Android only.
        </p>
      </div>
      <a
        href={download.url}
        className={cn(buttonClasses("secondary"), "shrink-0 sm:self-center")}
        aria-label={`Download Android App, MicroNest version ${download.version}, direct APK for Android`}
      >
        Download Android App
      </a>
    </section>
  );
}
