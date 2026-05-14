import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'standalone', // Removed for Vercel compatibility
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
      
      // Exclude problematic modules
      config.externals = {
        ...config.externals,
        'dotenv': 'dotenv',
        '@alpacahq/alpaca-trade-api': '@alpacahq/alpaca-trade-api',
      };
    }
    return config;
  },
};

export default nextConfig;
