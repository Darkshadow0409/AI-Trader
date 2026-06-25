import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        esbuildOptions: {
            target: "esnext",
        },
    },
    build: {
        target: "esnext",
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf("lightweight-charts") !== -1) {
                        return "chart-vendor";
                    }
                    return undefined;
                },
            },
        },
    },
});
