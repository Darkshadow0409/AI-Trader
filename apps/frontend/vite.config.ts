import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("lightweight-charts") !== -1) {
            return "chart-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
