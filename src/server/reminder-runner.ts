import "server-only";
import { z } from "zod";
import { parseHealth, reminderStore } from "@/reminders/store";
import { runReminderBatch } from "@/reminders/worker";
import { ResendReminderProvider } from "@/reminders/resend-provider";
import { authenticateInvocation, reply } from "./scheduled-invocation";

export async function reminderInvocation(
  request: Request,
  kind: "run" | "monitor",
) {
  const invocation = await authenticateInvocation(request, kind);
  if (invocation instanceof Response) return invocation;
  const { db, local } = invocation;
  try {
    const result = await db.rpc("reminder_worker_health", {
      p_persist: kind === "monitor",
    });
    if (result.error) throw new Error();
    const health = parseHealth(result.data);
    if (kind === "monitor")
      return reply(health, health.status === "degraded" ? 503 : 200);
    if (health.mode === "disabled")
      return reply({ mode: "disabled", claimed: 0, accepted: 0 });
    // Live transport is impossible in loopback tests, even if a real key was inherited.
    if (local || !process.env.RESEND_API_KEY) throw new Error();
    const provider = new ResendReminderProvider(
      process.env.RESEND_API_KEY,
      async (id, signal) => {
        const { data, error } = await db
          .rpc("lookup_reminder_acceptance", { p_id: id })
          .abortSignal(signal);
        if (error) return { kind: "unknown" };
        const evidence = z
          .object({ kind: z.literal("accepted"), providerId: z.uuid() })
          .safeParse(data);
        return evidence.success ? evidence.data : { kind: "unknown" };
      },
    );
    // Vercel's hard maxDuration is 60s. Stop starting work after35s, leaving
    // headroom for final acknowledgement/end; a hard stop recovers through leases.
    return reply(
      await runReminderBatch(reminderStore(db), provider, {
        limit: 3,
        budgetMs: 35000,
      }),
    );
  } catch {
    return reply({ status: "unavailable" }, 503);
  }
}
