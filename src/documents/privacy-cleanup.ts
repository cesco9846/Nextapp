import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function cleanupPrivacyExports(
  db: SupabaseClient<Database>,
  signal: AbortSignal,
  limit: number,
) {
  const result = await db
    .rpc("claim_privacy_export_cleanup", { p_limit: limit })
    .abortSignal(signal);
  if (result.error) throw new Error("Privacy cleanup unavailable");
  const claims = z
    .array(
      z.object({
        id: z.uuid(),
        claim: z.uuid(),
        path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/archive\.zip$/),
      }),
    )
    .max(limit)
    .parse(result.data);
  let completed = 0;
  for (const item of claims) {
    if (signal.aborted) break;
    const removed = await db.storage.from("glow-exports").remove([item.path]);
    if (removed.error) continue;
    const ack = await db
      .rpc("complete_privacy_export_cleanup", {
        p_id: item.id,
        p_claim: item.claim,
      })
      .abortSignal(signal);
    if (!ack.error && ack.data) completed++;
  }
  return { completed, retry: claims.length - completed };
}
