import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Local worker from `pnpm dev` (wrangler); override to point at another instance.
const api = process.env.INBOUND_API_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: api, changeOrigin: true, ws: true },
      "/h": { target: api, changeOrigin: true },
    },
  },
  build: {
    target: "es2023",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Rolldown takes the function form only
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/@codemirror|@uiw|@lezer/.test(id)) return "codemirror";
          if (/@heroui|react-aria|@react-aria|@react-stately|@internationalized/.test(id))
            return "heroui";
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
