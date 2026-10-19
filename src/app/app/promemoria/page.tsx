import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/session";
import { ReminderSettings } from "@/features/reminders/reminder-settings";

export default async function RemindersPage() {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner") redirect("/app/impostazioni");
  return <ReminderSettings />;
}
