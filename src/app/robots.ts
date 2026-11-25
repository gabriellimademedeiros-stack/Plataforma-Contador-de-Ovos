import type { MetadataRoute } from "next";

/** Beta privada: nada deve aparecer em buscadores (Parte 19.3). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
