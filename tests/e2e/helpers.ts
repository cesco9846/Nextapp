import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("E2E is restricted to local Supabase");
const admin = createClient<Database>(
  url,
  process.env.TEST_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
export async function account(withWorkspace = true) {
  const email = `test-${crypto.randomUUID()}@example.invalid`;
  const password = `Test-only-${crypto.randomUUID()}!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("Unable to create local test user");
  const db = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const session = await db.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error("Unable to authenticate local test user");
  if (withWorkspace) {
    const result = await db.rpc("bootstrap_workspace", {
      p_name: "Studio di prova",
      p_display_name: "Giulia Bianchi",
      p_location: "Studio centro",
      p_service: "Consulenza iniziale",
      p_duration: 60,
      p_price: 5000,
    });
    if (result.error) throw new Error("Unable to bootstrap test workspace");
  }
  return { email, password, db, id: data.user.id };
}
export async function login(
  page: Page,
  user: Awaited<ReturnType<typeof account>>,
) {
  await page.goto("/accedi");
  await page.getByLabel("Email professionale").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Accedi al tuo studio" }).click();
  await expect(page).toHaveURL(
    user ? /\/(app\/agenda|configurazione)$/ : /app/,
  );
}
export const origin = { Origin: "http://localhost:3100" };
