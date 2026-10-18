import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/agents", destination: "/research", permanent: true },
      { source: "/prompt-lab", destination: "/prompts", permanent: true },
    ];
  },
};

export default nextConfig;
