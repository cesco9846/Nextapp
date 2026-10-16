import { reminderClient } from "./reminder-client";
import { parseHealth } from "../src/reminders/store";
const args = process.argv.slice(2);
if (
  ![
    "--local",
    "--local --record",
    "--project-ref mexokvvvxdyekauupwvt",
    "--project-ref mexokvvvxdyekauupwvt --record",
  ].includes(args.join(" "))
)
  throw new Error(
    "Choose --local or --project-ref mexokvvvxdyekauupwvt, optionally --record",
  );
const { db } = reminderClient(args);
const result = await db.rpc("reminder_worker_health", {
  p_persist: args.includes("--record"),
});
if (result.error) {
  console.error(JSON.stringify({ status: "unavailable" }));
  process.exitCode = 1;
} else {
  const health = parseHealth(result.data);
  console.log(JSON.stringify(health));
  if (health.status === "degraded") process.exitCode = 2;
}
