import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // SIN_CACHE_WEBPACK=1: build sin caché en disco (útil con poco espacio libre)
  webpack: (config) => {
    if (process.env.SIN_CACHE_WEBPACK) config.cache = false;
    return config;
  },
  experimental: {
    // Las rutas marcadas pueden traer miles de puntos
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      {
        // El service worker no se debe cachear, así las actualizaciones llegan enseguida
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
