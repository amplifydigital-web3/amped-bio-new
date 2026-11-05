import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/constants", "@repo/ui"],
  // The Docker runtime image copies only the traced standalone server instead of
  // the whole node_modules tree. The tracing root must be the monorepo root so
  // the workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    localPatterns: [
      {
        pathname: "/og",
      },
    ],
  },
};

export default nextConfig;
