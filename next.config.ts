import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["youtubei.js"],
  turbopack: {
    resolveAlias: {
      // react-pdf optionally uses canvas — stub it out so Turbopack doesn't error
      canvas: { browser: "./src/lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
