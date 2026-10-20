/** Bounded, repeatable Storage cleanup. No public cron endpoint or secret in args. */
import { createClient } from "@supabase/supabase-js";
import { cleanupFiles } from "../src/documents/cleanup-worker";
import { localEnvironment } from "./local-env";
import type { Database } from "../src/lib/database.types";

const args = process.argv.slice(2);
const local = args.length === 1 && args[0] === "--local";
const official =
  args.length === 2 &&
  args[0] === "--project-ref" &&
  args[1] === "mexokvvvxdyekauupwvt";
if (!local && !official)
  throw new Error("Specify --local or --project-ref mexokvvvxdyekauupwvt");
const localConfig = local ? localEnvironment() : null;
const url =
  localConfig?.NEXT_PUBLIC_SUPABASE_URL ??
  "https://mexokvvvxdyekauupwvt.supabase.co";
const key =
  localConfig?.TEST_SUPABASE_SERVICE_KEY ??
  process.env.supabase_service_role_secret ??
  process.env.supabase_secret;
if (!key) throw new Error("Storage credential is unavailable");
const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          AbortSignal.timeout(10000),
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
  },
});
const result = await cleanupFiles(db, AbortSignal.timeout(45000), 50);
console.log(JSON.stringify(result));
if (result.retry) process.exitCode = 1;
