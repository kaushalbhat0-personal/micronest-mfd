import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      // RCCF-MFD-18 transitional: Client Radar is now the Today view.
      // Permanent — bookmarks should update to the workspace route.
      {
        source: "/tools/client-radar",
        destination: "/workspace/today",
        permanent: true,
      },
      // Transitional only: the standalone Follow-up Workspace is retired.
      // Temporary — follow-ups become a first-class workspace capability.
      {
        source: "/tools/followups",
        destination: "/workspace/today?filter=followups",
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
