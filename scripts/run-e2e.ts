import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
const env = {
  ...process.env,
  ...localEnvironment(),
  NODE_USE_ENV_PROXY: "1",
  NEXT_DIST_DIR: ".next-e2e",
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve("../.cache/ms-playwright"),
};
const build = spawnSync(
  process.execPath,
  ["--use-env-proxy", "node_modules/next/dist/bin/next", "build"],
  { env, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  {
    env,
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
