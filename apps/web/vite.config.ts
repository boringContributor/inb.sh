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
        manualChunks: {
          react: ["react", "react-dom"],
          heroui: ["@heroui/react", "react-aria-components"],
          codemirror: ["@uiw/react-codemirror", "@codemirror/lang-json", "@codemirror/lang-javascript"],
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
