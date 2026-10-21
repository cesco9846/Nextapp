import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { cloudWebkitOptions } from "./scripts/webkit-cloud";

// Only for the managed cloud without root; CI uses playwright.config.ts and
// Playwright's normal system dependencies and launch validation.
export default defineConfig({
  ...base,
  projects: base.projects!.map((project) =>
    project.name?.startsWith("webkit")
      ? {
          ...project,
          use: { ...project.use, launchOptions: cloudWebkitOptions() },
        }
      : project,
  ),
});
