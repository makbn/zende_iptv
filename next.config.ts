import type { NextConfig } from "next";

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
};

export default nextConfig;
