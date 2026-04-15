import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@artex/contract": resolve(__dirname, "../../packages/artex-contract/src/index.ts"),
    },
  },
});
