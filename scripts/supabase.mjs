import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const configRoot = resolve(".cache/supabase");
mkdirSync(configRoot, { recursive: true });
const env = {
  ...process.env,
  SUPABASE_HOME: process.env.SUPABASE_HOME ?? configRoot,
  SUPABASE_USE_SLIM_IMAGES: "true",
};
const result = spawnSync(
  process.execPath,
  ["node_modules/supabase/dist/supabase.js", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);
process.exit(result.status ?? 1);
