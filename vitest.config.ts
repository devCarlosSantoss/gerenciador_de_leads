import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Módulos de runtime do Next.js não disponíveis no vitest.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "next/headers": path.resolve(__dirname, "test/stubs/next-headers.ts"),
    },
  },
});