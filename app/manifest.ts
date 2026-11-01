import type { MetadataRoute } from "next";

/**
 * Minimal web manifest describing the existing product only.
 * No offline/PWA/installability claims: the Android app is a separate
 * Capacitor distribution path, and no service worker exists.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MicroNest",
    short_name: "MicroNest",
    description:
      "MicroNest is a simple relationship workspace for people who manage clients.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
