import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  // Static export has no image optimizer; the images in public/ are pre-sized WebP
  images: { unoptimized: true },
};

export default nextConfig;
