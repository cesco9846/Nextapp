import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { origin } from "./helpers";
import type { Database } from "@/lib/database.types";
import type { IntakeCreated } from "@/lib/intake";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local intake fixtures only");
export const intakeAdmin = createClient<Database>(
  url,
  process.env.TEST_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
export async function issueIntake(
  page: Page,
  id: string,
  preparationVersion = 1,
  appointmentVersion = 1,
) {
  const r = await page.request.post(`/api/appointments/${id}/intake`, {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      preparation_version: preparationVersion,
      appointment_version: appointmentVersion,
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as IntakeCreated;
}
export function waitingIntakeRequests() {
  return Number(
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_Nextapp",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%use_intake_link%'",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
}
export async function fillIntake(
  page: Page,
  text = "Risposta cliente sintetica",
) {
  await page
    .getByLabel("Annotazione dimostrativa (richiesta)", { exact: true })
    .fill(text);
  await page
    .getByRole("checkbox", {
      name: "Ho letto il testo e controllato le risposte da inviare allo studio.",
    })
    .check();
}
