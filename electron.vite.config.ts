import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/desktop/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
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
