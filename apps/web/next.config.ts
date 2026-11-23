import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@etimaad/core", "@etimaad/db"],
};

export default nextConfig;
