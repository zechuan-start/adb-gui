import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

function removeZxingCdnFallback(): Plugin {
  // zxing-wasm bundles its unused CDN default even when locateFile is overridden.
  const zxingShareModule = "/zxing-wasm/dist/es/share.js";
  const cdnOrigin = "https://fastly.jsdelivr.net";

  return {
    name: "remove-zxing-cdn-fallback",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(zxingShareModule) || !code.includes(cdnOrigin)) {
        return null;
      }
      return code.replaceAll(cdnOrigin, "");
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), removeZxingCdnFallback()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
