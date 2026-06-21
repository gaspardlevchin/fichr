import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  reactStrictMode: true,
  turbopack: {
    root: projectRoot
  }
};

export default nextConfig;
