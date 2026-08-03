import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ampedbio/constants", "@ampedbio/ui"],
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
