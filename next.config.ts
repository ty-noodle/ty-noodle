import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [320, 375, 414, 640, 750, 828, 1080, 1200, 1440, 1920],
    imageSizes: [16, 24, 32, 36, 40, 44, 48, 52, 56, 64, 72, 80, 96, 112, 128, 176, 220, 256, 384],
    remotePatterns: [
      {
        hostname: "**.supabase.co",
        protocol: "https",
      },
      {
        hostname: "placehold.co",
        protocol: "https",
      },
      {
        hostname: "lh3.googleusercontent.com",
        protocol: "https",
      },
      {
        hostname: "profile.line-scdn.net",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
