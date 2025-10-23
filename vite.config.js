import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["kadolta-logo.png"], // make sure your logo is in public folder
      manifest: {
        name: "Kadolta Packaging Ltd Job System",
        short_name: "KadoltaApp",
        theme_color: "#1D4ED8",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "kadolta-logo.png", sizes: "192x192", type: "image/png" },
          { src: "kadolta-logo.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
