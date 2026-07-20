import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg", "web-app-manifest-192x192.png", "web-app-manifest-512x512.png"],
      manifest: {
        name: "Bitam Telecom",
        short_name: "Bitam Telecom",
        description: "متجر بيتام تيليكوم - هواتف، قطع غيار واكسسوارات",
        theme_color: "#0E1013",
        background_color: "#0E1013",
        display: "standalone",
        start_url: "/",
        scope: "/",
        dir: "rtl",
        lang: "ar",
        icons: [
  {
    src: "icons/icon.svg",
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any"
  },
  {
    src: "web-app-manifest-192x192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any"
  },
  {
    src: "web-app-manifest-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any"
  },
  {
    src: "web-app-manifest-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable"
  }
],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      }
    })
  ]
});
