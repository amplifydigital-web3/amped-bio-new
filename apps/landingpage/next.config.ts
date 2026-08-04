import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/constants", "@repo/ui"],
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
  },
};

export default nextConfig;
