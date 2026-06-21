import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"]
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/victory-vendor") || id.includes("node_modules/lodash") || id.includes("node_modules/recharts-scale")) {
            return "chart-vendor";
          }
          if (id.includes("node_modules/recharts")) return "charts";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "react";
          return undefined;
        }
      }
    }
  }
});
