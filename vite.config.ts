import { defineConfig } from "vite-plus";

export default defineConfig({
  // sst.config.ts relies on SST globals ($config, sst, $app…) from .sst/platform
  fmt: { ignorePatterns: ["sst.config.ts"] },
  lint: {
    ignorePatterns: ["sst.config.ts", ".sst/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
