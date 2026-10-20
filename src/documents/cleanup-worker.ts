import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../lib/database.types";

const claimsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      claim: z.uuid(),
      bucket: z.literal("glow-private"),
      paths: z.array(z.string().min(1)).min(1).max(2),
    }),
  )
  .max(50);

// SQL decides eligibility and exact paths. Ready originals and signed PDFs are
// never candidates. Interrupted deletions recover through the existing lease.
export async function cleanupFiles(
  db: SupabaseClient<Database>,
  signal: AbortSignal,
  limit: 10 | 50 = 10,
) {
  const deadline = Date.now() + 35000;
  const claims = await db
    .rpc("claim_file_cleanup", { p_limit: limit })
    .abortSignal(signal);
  if (claims.error) throw new Error("Cleanup claim unavailable");
  const items = claimsSchema.parse(claims.data);
  if (items.length > limit) throw new Error("Cleanup batch exceeds limit");
  let completed = 0;
  for (const item of items) {
    if (signal.aborted || Date.now() >= deadline) break;
    const removed = await db.storage.from(item.bucket).remove(item.paths);
    if (removed.error) continue;
    const ack = await db
      .rpc("complete_file_cleanup", { p_id: item.id, p_claim: item.claim })
      .abortSignal(signal);
    if (!ack.error) completed++;
  }
  return { claimed: items.length, completed, retry: items.length - completed };
}
