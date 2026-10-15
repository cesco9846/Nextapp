import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".cache/**",
    "node_modules/**",
    ".agents/**",
    ".impeccable/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
