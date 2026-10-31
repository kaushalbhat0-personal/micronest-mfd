/**
 * MFD-64 P0 — native file + clipboard bridges.
 *
 * Web paths are UNCHANGED (Blob + anchor.download, navigator.clipboard +
 * execCommand fallback). Native adapters activate only when isNative().
 *
 * Downloads: generate bytes with existing domain builders, then hand them
 * to saveBytesNative() → Filesystem.writeFile (Cache) → Share.share.
 * File contents/schemas/semantics are never altered here.
 */
import { isNative } from "./runtime";

/** Existing import constraints — mirrored, never raised. */
export const NATIVE_IMPORT_ACCEPT = ".csv,.xlsx";
export const NATIVE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const NATIVE_IMPORT_MAX_ROWS = 500;

/** Minimum compatibility note for <input type="file"> inside the WebView. */
export function filePickerCompat(): {
  supported: boolean;
  accept: string;
  maxBytes: number;
  maxRows: number;
  note: string;
} {
  return {
    supported: true,
    accept: NATIVE_IMPORT_ACCEPT,
    maxBytes: NATIVE_IMPORT_MAX_BYTES,
    maxRows: NATIVE_IMPORT_MAX_ROWS,
    note: "Standard <input type=file> is sufficient; Android onShowFileChooser and iOS Files picker handle selection. No camera/media permissions.",
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in WebView and modern Node 16+ (used only natively).
  return btoa(binary);
}

function stringToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Save generated file bytes natively and present the share sheet.
 * Returns the native file URI. Web never calls this (uses anchor.download).
 */
export async function saveBytesNative(
  fileName: string,
  data: string | Uint8Array,
  mimeType = "application/octet-stream",
): Promise<{ uri: string }> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const bytes = typeof data === "string" ? stringToBytes(data) : data;
  const result = await Filesystem.writeFile({
    path: fileName,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
  });
  void mimeType;
  await Share.share({
    title: fileName,
    text: fileName,
    url: result.uri,
  });
  return { uri: result.uri };
}

/**
 * Native-aware download: web uses the provided browser downloader,
 * native uses Filesystem+Share. Content identical either way.
 */
export async function downloadFileNativeAware(
  fileName: string,
  content: string | Uint8Array,
  mimeType: string,
  browserDownload: () => void,
): Promise<{ via: "browser" | "native"; uri?: string }> {
  if (!isNative()) {
    browserDownload();
    return { via: "browser" };
  }
  const { uri } = await saveBytesNative(fileName, content, mimeType);
  return { via: "native", uri };
}

/**
 * Copy text: browser path first (navigator.clipboard + execCommand
 * fallback lives at the call site), Capacitor Clipboard only as a
 * native fallback. Never changes visible UX.
 */
export async function copyTextNativeFallback(text: string): Promise<boolean> {
  try {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return true;
  } catch {
    return false;
  }
}
