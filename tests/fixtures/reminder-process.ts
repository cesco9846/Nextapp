/** Only started by local integration tests to prove recovery from SIGKILL. */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { reminderStore } from "@/reminders/store";
import { runReminderBatch } from "@/reminders/worker";
import { FixtureProvider } from "../e2e/reminder-provider";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Local DB only");
const db = createClient<Database>(url, process.env.TEST_SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await runReminderBatch(
  reminderStore(db),
  new FixtureProvider(process.env.TEST_REMINDER_GATEWAY!),
  { limit: 1, timeoutMs: 10000 },
);
