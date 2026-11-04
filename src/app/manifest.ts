import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Mis viajes en moto",
    short_name: "Mis viajes",
    description: "Bitácora personal de viajes en moto: rutas, kilómetros, fotos y videos",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    categories: ["travel", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo viaje", short_name: "Nuevo", url: "/viajes/nuevo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mis viajes", short_name: "Viajes", url: "/viajes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
