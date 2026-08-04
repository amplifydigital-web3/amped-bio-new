import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/constants", "@repo/ui"],
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
