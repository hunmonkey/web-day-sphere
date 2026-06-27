import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/*": [
      "./AGENTS.md",
      "./CLAUDE.md",
      "./Dockerfile",
      "./README.md",
      "./Rule_*.txt",
      "./docker-compose*.yml",
      "./eslint.config.mjs",
      "./postcss.config.mjs",
      "./src/**/*",
      "./tsconfig.json",
      "./tsconfig.tsbuildinfo",
    ],
  },
};

export default nextConfig;
