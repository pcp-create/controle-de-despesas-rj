import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Controle de Despesas - RJ Compressores",
    short_name: "RJ Despesas",
    description:
      "Sistema de controle de despesas corporativas para técnicos externos da RJ Compressores.",
    start_url: "/",
    display: "standalone",
    background_color: "#1a2d5a",
    theme_color: "#1a2d5a",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
