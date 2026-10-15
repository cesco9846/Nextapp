import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Glow",
    short_name: "Glow",
    description: "Il tuo studio, in ordine.",
    start_url: "/app/agenda",
    id: "/",
    scope: "/",
    display: "standalone",
    lang: "it",
    background_color: "#f5f7f8",
    theme_color: "#28664f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
