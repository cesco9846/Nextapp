import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../lib/database.types";
import {
  claimSchema,
  envelopeSchema,
  type ReminderStore,
  type Claim,
  type Result,
  type LookupResult,
} from "./contracts";
export function reminderStore(db: SupabaseClient<Database>): ReminderStore {
  function checked<T>({
    data,
    error,
  }: {
    data: T;
    error: { code?: string } | null;
  }) {
    if (error)
      throw new Error(
        `Reminder database operation failed (${error.code ?? "UNAVAILABLE"})`,
      );
    return data;
  }
  return {
    async start(id, provider) {
      return (
        checked(
          await db.rpc("start_reminder_run", {
            p_id: id,
            p_provider: provider,
          }),
        ) === true
      );
    },
    async claim(run) {
      const data = checked(await db.rpc("claim_reminder", { p_run: run }));
      return data ? claimSchema.parse(data) : null;
    },
    async begin(job) {
      const data = checked(
        await db.rpc("begin_reminder_dispatch", {
          p_id: job.id,
          p_claim: job.claim,
        }),
      );
      return data ? envelopeSchema.parse(data) : null;
    },
    async finish(job: Claim, result: Result | LookupResult) {
      checked(
        await db.rpc("finish_reminder", {
          p_id: job.id,
          p_claim: job.claim,
          p_result: result.kind,
          ...(result.kind === "accepted"
            ? { p_provider_id: result.providerId }
            : {}),
        }),
      );
    },
    async end(run, ok) {
      checked(await db.rpc("finish_reminder_run", { p_id: run, p_ok: ok }));
    },
  };
}
export function parseHealth(value: Json) {
  return healthSchema.parse(value);
}
import { z } from "zod";
const healthSchema = z.object({
  mode: z.enum(["disabled", "enabled"]),
  status: z.enum(["ok", "degraded"]),
  last_success_at: z.string().nullable(),
  last_started_at: z.string().nullable(),
  warnings: z.array(
    z.object({
      kind: z.enum([
        "worker_stale",
        "queue_lag",
        "uncertain",
        "failed",
        "worker_failed",
      ]),
      affected: z.number().int().nonnegative(),
    }),
  ),
  counts: z.object({
    queue_lag: z.number().int().nonnegative(),
    uncertain: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
