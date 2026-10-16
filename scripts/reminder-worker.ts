import { reminderClient } from "./reminder-client";
import { parseHealth, reminderStore } from "../src/reminders/store";
import { runReminderBatch } from "../src/reminders/worker";
import { TestReminderProvider } from "../src/reminders/test-provider";
import { ResendReminderProvider } from "../src/reminders/resend-provider";
import { z } from "zod";
const args = process.argv.slice(2);
if (
  ![
    "--local",
    "--local --simulate",
    "--project-ref mexokvvvxdyekauupwvt",
    "--project-ref mexokvvvxdyekauupwvt --send",
  ].includes(args.join(" "))
)
  throw new Error(
    "Use --local [--simulate] or --project-ref mexokvvvxdyekauupwvt [--send]",
  );
const { db, url, local } = reminderClient(args);
const result = await db.rpc("reminder_worker_health", { p_persist: false });
if (result.error) throw new Error("Reminder health unavailable");
const health = parseHealth(result.data);
if (health.mode === "disabled")
  console.log(JSON.stringify({ mode: "disabled", claimed: 0, accepted: 0 }));
else {
  const simulate = local && args.includes("--simulate");
  const live = !local && args.includes("--send") && process.env.RESEND_API_KEY;
  if (!simulate && !live)
    throw new Error(
      "Choose local --simulate or official --send with RESEND_API_KEY; no messages claimed",
    );
  const provider = simulate
    ? new TestReminderProvider(url)
    : new ResendReminderProvider(
        process.env.RESEND_API_KEY!,
        async (id, signal) => {
          const { data, error } = await db
            .rpc("lookup_reminder_acceptance", { p_id: id })
            .abortSignal(signal);
          if (error) return { kind: "unknown" };
          const result = z
            .object({ kind: z.literal("accepted"), providerId: z.uuid() })
            .safeParse(data);
          return result.success ? result.data : { kind: "unknown" };
        },
      );
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  try {
    console.log(
      JSON.stringify(
        await runReminderBatch(reminderStore(db), provider, {
          signal: stop.signal,
        }),
      ),
    );
  } catch {
    console.error(
      JSON.stringify({ status: "failed", code: "REMINDER_BATCH_INCOMPLETE" }),
    );
    process.exitCode = 1;
  }
}
