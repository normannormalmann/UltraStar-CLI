import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Main & Preload bündeln bewusst ALLE JS-Dependencies (effect, exceljs, …)
// ins Output — nur "electron" bleibt extern. Die gepackte App ist dadurch
// self-contained und braucht kein node_modules zur Laufzeit.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: { index: resolve("src/desktop/main/index.ts") },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: { index: resolve("src/desktop/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve("src/desktop/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/desktop/renderer/index.html") },
      },
    },
  },
});
