export type ReminderPreferences = {
  enabled: boolean;
  from: string;
  reply_to: string | null;
  reply_to_verified: boolean;
  delivery_enabled: boolean;
  hours_before: number;
};
export type ReminderHealth = {
  mode: "enabled" | "disabled";
  status: "ok" | "degraded";
  counts: { queued: number; uncertain: number; failed: number };
};
export type ReminderMessage = {
  id: string;
  status: string;
  scheduled_for: string;
  updated_at: string;
  failure_code: string | null;
  cancellation_requested_at: string | null;
  client: { id: string; first_name: string; last_name: string } | null;
};
export type ReminderPage = {
  items: ReminderMessage[];
  next_cursor: string | null;
};
