import type { NextConfig } from "next";
import path from "node:path";

const root = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  serverExternalPackages: ["dockerode", "docker-modem", "ssh2"],
  /**
   * React 18 Strict Mode (dev) mounts effects twice — two Hls.js instances hammer the same
   * proxy session and worsen live segment 404s. Disable until we isolate media attach differently.
   */
  reactStrictMode: false,
  transpilePackages: ["liquid-glass-react"],
  poweredByHeader: false,
  /** Fewer modules per chunk — faster dev compiles & smaller route bundles (esp. lucide-react). */
  experimental: {
    optimizePackageImports: ["lucide-react", "@base-ui/react"],
  },
  /**
   * If you run `next dev --turbopack`, PostCSS may resolve `tailwindcss` from `src/app`.
   * Alias + root fixes that; default npm scripts use `--webpack` because webpack reliably
   * resolves Tailwind v4 (`@import "tailwindcss"` / `tailwindcss/index.css`).
   */
  turbopack: {
    root,
    resolveAlias: {
      tailwindcss: path.join(root, "node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
