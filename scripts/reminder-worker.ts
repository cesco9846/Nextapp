import { reminderClient } from "./reminder-client";
import { parseHealth, reminderStore } from "../src/reminders/store";
import { runReminderBatch } from "../src/reminders/worker";
import { TestReminderProvider } from "../src/reminders/test-provider";
const args = process.argv.slice(2);
if (
  ![
    "--local",
    "--local --simulate",
    "--project-ref mexokvvvxdyekauupwvt",
  ].includes(args.join(" "))
)
  throw new Error(
    "Use --local [--simulate] or --project-ref mexokvvvxdyekauupwvt",
  );
const { db, url, local } = reminderClient(args);
const result = await db.rpc("reminder_worker_health", { p_persist: false });
if (result.error) throw new Error("Reminder health unavailable");
const health = parseHealth(result.data);
if (health.mode === "disabled")
  console.log(JSON.stringify({ mode: "disabled", claimed: 0, accepted: 0 }));
else {
  if (!local || !args.includes("--simulate"))
    throw new Error(
      "Real email adapter is not configured; no messages claimed",
    );
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  try {
    console.log(
      JSON.stringify(
        await runReminderBatch(
          reminderStore(db),
          new TestReminderProvider(url),
          { signal: stop.signal },
        ),
      ),
    );
  } catch {
    console.error(
      JSON.stringify({ status: "failed", code: "REMINDER_BATCH_INCOMPLETE" }),
    );
    process.exitCode = 1;
  }
}
