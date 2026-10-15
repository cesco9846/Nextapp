/** Bounded, repeatable Storage cleanup. No public cron endpoint or secret in args. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
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
});
const claims = await db.rpc("claim_file_cleanup", { p_limit: 50 });
if (claims.error) {
  const code = /^[A-Z0-9]{1,12}$/.test(claims.error.code ?? "")
    ? claims.error.code
    : "UNAVAILABLE";
  throw new Error(`Cannot claim file cleanup (HTTP ${claims.status}, ${code})`);
}
const schema = z.array(
  z.object({
    id: z.uuid(),
    claim: z.uuid(),
    bucket: z.literal("glow-private"),
    paths: z.array(z.string()).min(1).max(2),
  }),
);
const items = schema.parse(claims.data);
let completed = 0;
for (const item of items) {
  // Failed deletion leaves the lease to expire. Another run resumes safely.
  const removed = await db.storage.from(item.bucket).remove(item.paths);
  if (removed.error) continue;
  const acknowledged = await db.rpc("complete_file_cleanup", {
    p_id: item.id,
    p_claim: item.claim,
  });
  if (!acknowledged.error) completed++;
}
console.log(
  JSON.stringify({
    claimed: items.length,
    completed,
    retry: items.length - completed,
  }),
);
if (completed !== items.length) process.exitCode = 1;
