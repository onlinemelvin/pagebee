import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generation `finalize` route precompiles Tailwind with the NATIVE @tailwindcss/oxide +
  // lightningcss binaries (via a dynamic require, so the tracer can't see them). Force-include them
  // for that route so the precompile runs on Vercel serverless instead of falling back to the
  // slower Tailwind CDN. (inlineTailwind degrades gracefully if any of this is still missing.)
  outputFileTracingIncludes: {
    "/api/v1/internal/generate/finalize": [
      "./node_modules/@tailwindcss/oxide*/**",
      "./node_modules/@tailwindcss/node/**",
      "./node_modules/lightningcss*/**",
      "./node_modules/tailwindcss/**",
    ],
  },
};

export default nextConfig;
