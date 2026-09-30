import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    platform: "node",
    banner: { js: "#!/usr/bin/env node" },
  },
});
