import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Vitest config for the unit suites (currently the SM-2 scheduler parity tests). The `@` alias
// mirrors tsconfig.json so test files and the modules under test resolve imports the same way the
// app does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
