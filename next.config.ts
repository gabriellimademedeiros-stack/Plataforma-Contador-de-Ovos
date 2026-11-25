import type { NextConfig } from "next";

// Decisão (docs/DECISOES.md): Cache Components desligado. Todas as telas dependem
// da sessão (cookie) e de dados que mudam; o modelo dinâmico clássico é mais simples.
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
