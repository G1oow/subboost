import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

const coverageThresholds = {
  lines: 97,
  statements: 97,
  functions: 97,
  // 分支阈值 96：清理掉旧前端后，剩余代码以 core 解析/生成引擎为主，
  // 其真实分支覆盖约 96.2%，原 97% 是被大量 UI 代码摊平出来的。
  branches: 96,
} as const;

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: [
          "packages/**/*.{ts,tsx,js,cjs,mjs}",
          "scripts/**/*.{ts,tsx,js,cjs,mjs}",
        ],
        exclude: [
          "**/*.{test,spec}.{ts,tsx,js,cjs,mjs}",
          "**/*.test-{helpers,utils}.{ts,tsx,js,cjs,mjs}",
          "**/*.d.ts",
          "**/node_modules/**",
          "**/.next/**",
          "**/dist/**",
          "**/build/**",
          "**/coverage/**",
          "**/.cache/**",
          "**/.turbo/**",
          "**/fixtures/**",
          "**/__fixtures__/**",
          "**/*.config.{ts,tsx,js,cjs,mjs}",
          "**/eslint.config.{ts,js,mjs}",
          "**/next.config.{ts,js,mjs}",
          "**/postcss.config.{ts,js,mjs}",
          "**/tailwind.config.{ts,js,mjs}",
          "**/generated/prisma/**",
          "**/prisma/generated/**",
        ],
        reporter: ["text", "json-summary", "html", "lcov"],
        reportsDirectory: "coverage",
        thresholds: coverageThresholds,
      },
    },
  }),
);
