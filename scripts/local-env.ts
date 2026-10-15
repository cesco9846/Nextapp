import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function localEnvironment() {
  const status = JSON.parse(
    execFileSync(
      process.execPath,
      ["node_modules/supabase/dist/supabase.js", "status", "--output", "json"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_HOME:
            process.env.SUPABASE_HOME ?? resolve(".cache/supabase"),
          SUPABASE_USE_SLIM_IMAGES: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  ) as Record<string, string>;
  const host = new URL(status.API_URL).hostname;
  if (!["127.0.0.1", "localhost"].includes(host))
    throw new Error("Tests require a local Supabase URL");
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      status.PUBLISHABLE_KEY || status.ANON_KEY,
    NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    TEST_SUPABASE_SERVICE_KEY: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
  };
}
