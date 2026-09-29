import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["{lib,features,jobs,db}/**/*.test.{ts,tsx}"],
          exclude: ["**/*.int.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "jobs/**/*.ts", "db/**/*.ts"],
      // UI components and Next.js request glue (server actions, session helpers, startup) need a
      // running Next server and are covered by the Playwright suite (tests/e2e), not unit coverage.
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "db/schema/**",
        "**/components/**",
        "**/server/actions.ts",
        "lib/auth/client.ts",
        "lib/auth/session.ts",
        "lib/auth/server.ts",
        "lib/bootstrap.ts",
        "lib/cn.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
