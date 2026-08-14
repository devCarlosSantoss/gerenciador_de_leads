import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/env.setup.ts"],
    include: ["test/**/*.spec.ts"],
  },
});