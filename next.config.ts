import type { NextConfig } from "next";
import path from "node:path";

const root = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  transpilePackages: ["liquid-glass-react"],
  poweredByHeader: false,
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
