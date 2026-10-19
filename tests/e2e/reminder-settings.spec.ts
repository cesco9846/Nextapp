import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { intakeAdmin } from "./intake-helpers";
import type { ReminderPage } from "@/features/reminders/types";

async function capture(page: Page, state: string, widths = [375, 820, 1280]) {
  const directory = process.env.GLOW_REMINDERS_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(resolve(directory), { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(directory, `${state}-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}
async function fixtures(page: Page, count = 9) {
  const owner = await account();
  await login(page, owner);
  const result = await page.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "Alessandra",
      last_name: "Della Rovere",
      email: "reminder-fixture@example.invalid",
      phone: "",
    },
  });
  expect(result.status()).toBe(201);
  const client = (await result.json()) as { id: string };
  const tenant = (await owner.db.from("tenants").select("id").single()).data!;
  const service = (await owner.db.from("services").select("id").single()).data!;
  const location = (await owner.db.from("locations").select("id").single())
    .data!;
  const starts = new Date(Date.now() + 48 * 3600000);
  const appointment = await owner.db.rpc("create_appointment", {
    p_key: crypto.randomUUID(),
    p_data: {
      client_id: client.id,
      service_id: service.id,
      location_id: location.id,
      operator_id: owner.id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(appointment.error).toBeNull();
  const statuses = [
    "accepted",
    "delivered",
    "uncertain",
    "bounced",
    "failed",
    "cancelled",
    "skipped",
    "queued",
    "processing",
  ];
  // Historical revisions with equal timestamps exercise the keyset tie-breaker.
  const messages = await intakeAdmin
    .from("messages")
    .insert(
      Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        appointment_id: appointment.data!.id,
        schedule_revision: i + 1,
        kind: "reminder_24h",
        scheduled_for: "2026-10-20T08:00:00+00:00",
        status: statuses[i % statuses.length],
        failure_code: i === 3 ? "provider_bounced" : null,
        cancellation_requested_at: i === 2 ? "2026-10-19T09:00:00+00:00" : null,
        provider_id: `private-provider-${i}`,
      })),
    )
    .select("id");
  expect(messages.error).toBeNull();
  return { owner, tenant, ids: messages.data!.map((m) => m.id) };
}

test("studio preferences save without activating delivery or backfilling; offline changes are never queued", async ({
  page,
  context,
}) => {
  const owner = await account();
  await login(page, owner);
  await page.goto("/app/impostazioni");
  await page.getByRole("link", { name: "Gestisci promemoria email" }).click();
  const toggle = page.getByRole("checkbox", {
    name: "Prepara promemoria email",
  });
  await expect(toggle).not.toBeChecked();
  await expect(
    page.getByText("Invii automatici non ancora attivi", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Qui troverai i promemoria del tuo studio",
    }),
  ).toBeVisible();
  await capture(page, "empty");
  await toggle.check();
  await page.getByRole("button", { name: "Salva preferenza" }).click();
  await expect(
    page.getByText("Preferenza salvata.", { exact: false }),
  ).toBeVisible();
  const settings = await page.request.get("/api/reminders/settings");
  expect(await settings.json()).toMatchObject({
    enabled: true,
    delivery_enabled: false,
    reply_to: owner.email,
  });
  expect(
    (await (await page.request.get("/api/reminders/messages")).json()).items,
  ).toEqual([]);
  let writes = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/reminders/settings") && r.method() === "PUT")
      writes++;
  });
  await context.setOffline(true);
  await expect(toggle).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salva preferenza" }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(toggle).toBeEnabled();
  expect(writes).toBe(0);
  await toggle.uncheck();
  await page.route("**/api/reminders/settings", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        json: { error: "Salvataggio non disponibile. Riprova tra poco." },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Salva preferenza" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Salvataggio non disponibile" }),
  ).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await capture(page, "save-error", [375]);
  await page.unroute("**/api/reminders/settings");
  await page.getByRole("button", { name: "Salva preferenza" }).click();
  await expect(
    page.getByText("Promemoria disattivati per lo studio.", { exact: false }),
  ).toBeVisible();
});

test("delivery history distinguishes acceptance, delivery and uncertainty and opens the existing client sheet", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/app/promemoria");
  await expect(
    page.getByText("Accettata per l’invio", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Consegnata", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Esito da verificare", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("L’email potrebbe essere partita.", { exact: false }),
  ).toContainText("non può essere richiamata");
  await expect(
    page.getByText("Non conferma la lettura", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /reinvia|invia ora/i }),
  ).toHaveCount(0);
  await capture(page, "history");
  await page
    .getByRole("button", { name: "Alessandra Della Rovere", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Scheda cliente" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Da verificare", exact: true })
    .click();
  await expect(
    page.getByText("Accettata per l’invio", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("li").filter({ hasText: "Invio previsto:" }),
  ).toHaveCount(4);
});

test("history is private, tenant-scoped, bounded and paginates equal scheduled timestamps without gaps", async ({
  page,
  browser,
}) => {
  expect((await page.request.get("/api/reminders/messages")).status()).toBe(
    401,
  );
  const f = await fixtures(page, 28);
  const firstResponse = await page.request.get("/api/reminders/messages");
  expect(firstResponse.headers()["cache-control"]).toContain("no-store");
  const first = (await firstResponse.json()) as ReminderPage;
  expect(first.items).toHaveLength(25);
  const second = (await (
    await page.request.get(
      `/api/reminders/messages?cursor=${first.next_cursor}`,
    )
  ).json()) as ReminderPage;
  expect(second.items).toHaveLength(3);
  expect(second.next_cursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((m) => m.id)).size).toBe(
    28,
  );
  expect(JSON.stringify(first)).not.toMatch(
    /provider_id|private-provider|reminder-fixture|envelope|email|attempts/,
  );
  for (const query of [
    "cursor=bad",
    "cursor=",
    "filter=unknown",
    `cursor=${Buffer.from(JSON.stringify(["2026-10-20T00:00:00Z),id.gt.0", crypto.randomUUID()])).toString("base64url")}`,
  ])
    expect(
      (await page.request.get(`/api/reminders/messages?${query}`)).status(),
    ).toBe(422);
  await page.goto("/app/promemoria");
  await expect(
    page.locator("li").filter({ hasText: "Invio previsto:" }),
  ).toHaveCount(25);
  await page.getByRole("button", { name: "Meno recenti" }).click();
  await expect(
    page.locator("li").filter({ hasText: "Invio previsto:" }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Più recenti" }).click();
  await expect(
    page.locator("li").filter({ hasText: "Invio previsto:" }),
  ).toHaveCount(25);
  const other = await account();
  const context = await browser.newContext();
  const otherPage = await context.newPage();
  await login(otherPage, other);
  const otherResult = await otherPage.request.get(
    `/api/reminders/messages?tenant_id=${f.tenant.id}`,
  );
  expect((await otherResult.json()).items).toEqual([]);
  expect(
    (
      await (
        await otherPage.request.get(
          `/api/reminders/messages?cursor=${first.next_cursor}`,
        )
      ).json()
    ).items,
  ).toEqual([]);
  await context.close();
});

test("operators cannot read or change reminder preferences and history", async ({
  page,
}) => {
  const owner = await account(),
    operator = await account(false);
  const tenant = (await owner.db.from("tenants").select("id").single()).data!;
  expect(
    (
      await intakeAdmin.from("users").insert({
        id: operator.id,
        tenant_id: tenant.id,
        display_name: "Operatrice di prova",
        role: "operator",
      })
    ).error,
  ).toBeNull();
  await login(page, operator);
  for (const path of ["settings", "health", "messages"])
    expect((await page.request.get(`/api/reminders/${path}`)).status()).toBe(
      403,
    );
  expect(
    (
      await page.request.put("/api/reminders/settings", {
        headers: origin,
        data: { enabled: true },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/app/promemoria");
  await expect(page).toHaveURL(/\/app\/impostazioni$/);
  await expect(
    page.getByRole("link", { name: "Gestisci promemoria email" }),
  ).toHaveCount(0);
});
