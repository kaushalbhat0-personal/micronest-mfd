import { describe, expect, it, afterEach } from "vitest";
import {
  getAndroidDownload,
  ANDROID_APP_VERSION,
  INTENDED_GITHUB_APK_URL,
} from "@/lib/download/config";

const KEY = "NEXT_PUBLIC_ANDROID_APK_URL";
const previous = process.env[KEY];

afterEach(() => {
  if (previous === undefined) delete process.env[KEY];
  else process.env[KEY] = previous;
});

describe("android download destination", () => {
  it("renders nothing when unconfigured", () => {
    delete process.env[KEY];
    expect(getAndroidDownload()).toBeNull();
  });

  it("renders nothing for blank or non-https values", () => {
    process.env[KEY] = "   ";
    expect(getAndroidDownload()).toBeNull();
    process.env[KEY] = "http://example.com/app.apk";
    expect(getAndroidDownload()).toBeNull();
    process.env[KEY] = "not a url";
    expect(getAndroidDownload()).toBeNull();
  });

  it("returns the configured https asset URL with the app version", () => {
    process.env[KEY] = INTENDED_GITHUB_APK_URL;
    const download = getAndroidDownload();
    expect(download?.url).toBe(INTENDED_GITHUB_APK_URL);
    expect(download?.version).toBe(ANDROID_APP_VERSION);
    expect(download?.channel).toBe("direct-apk");
  });
});
