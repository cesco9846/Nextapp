import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { localEnvironment } from "./local-env";
export function reminderClient(args: string[]) {
  const local = args.includes("--local"),
    official =
      args.includes("--project-ref") &&
      args[args.indexOf("--project-ref") + 1] === "mexokvvvxdyekauupwvt";
  if (local === official)
    throw new Error("Choose --local or --project-ref mexokvvvxdyekauupwvt");
  const config = local ? localEnvironment() : null;
  const url =
    config?.NEXT_PUBLIC_SUPABASE_URL ??
    "https://mexokvvvxdyekauupwvt.supabase.co";
  const key =
    config?.TEST_SUPABASE_SERVICE_KEY ??
    process.env.supabase_service_role_secret ??
    process.env.supabase_secret;
  if (!key) throw new Error("Reminder credential unavailable");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
        }),
    },
  });
  return { db, url, local };
}
