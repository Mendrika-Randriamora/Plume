import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // fileURLToPath décode correctement les chemins contenant des espaces
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    rollupOptions: {
      output: {
        // ECharts ne sert qu'à la page Ressources (chargée à la demande) : il
        // reste dans son propre fichier, hors du bundle de démarrage.
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (path.includes("/node_modules/echarts/") || path.includes("/node_modules/zrender/")) {
            return "charts";
          }
        },
      },
    },
  },
});
