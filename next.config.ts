import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["morally-underdone-unread.ngrok-free.dev"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;