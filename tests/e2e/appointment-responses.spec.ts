import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import type { CreatedActionLink } from "@/lib/appointment-response";

async function scenario(page: Page) {
  const owner = await account();
  await login(page, owner);
  const client = await page.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "Elena",
      last_name: "Risposta di prova",
      email: "response@example.invalid",
      phone: "+393331234567",
    },
  });
  expect(client.status()).toBe(201);
  const service = (await owner.db.from("services").select("id").single()).data!;
  const location = (await owner.db.from("locations").select("id").single())
    .data!;
  const starts = new Date(Date.now() + 3 * 86400000);
  const created = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      client_id: (await client.json()).id,
      service_id: service.id,
      location_id: location.id,
      operator_id: owner.id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(created.status()).toBe(201);
  const appointment = await created.json();
  const r = await page.request.post(
    `/api/appointments/${appointment.id}/response-links`,
    {
      headers: origin,
      data: { request_id: crypto.randomUUID(), appointment_version: 1 },
    },
  );
  expect(r.status()).toBe(201);
  const link = (await r.json()) as CreatedActionLink;
  return {
    owner,
    appointment,
    link,
    async row() {
      return (
        await owner.db
          .from("appointments")
          .select("status,version,schedule_revision,starts_at")
          .eq("id", appointment.id)
          .single()
      ).data!;
    },
  };
}
async function capture(page: Page, name: string, width: number) {
  if (process.env.GLOW_CAPTURE_RESPONSES !== "1") return;
  await mkdir(".impeccable/review/appointment-response", { recursive: true });
  await page.setViewportSize({
    width,
    height: name === "policy" ? 2200 : width < 600 ? 844 : 1000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/appointment-response/${name}-${width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("personal link reads safely, confirms and cancels with explicit actions", async ({
  page,
  browser,
}) => {
  const f = await scenario(page);
  expect(
    (await page.request.get("/api/appointment-response/submit")).status(),
  ).toBe(405);
  expect(
    (await page.request.head("/api/appointment-response/submit")).status(),
  ).toBe(405);
  const preview = await page.request.get(`/appuntamento#${f.link.token}`);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["cache-control"]).toContain("no-store");
  expect(preview.headers()["referrer-policy"]).toBe("no-referrer");
  expect((await f.row()).status).toBe("booked");
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/appuntamento#${f.link.token}`);
  await expect(
    guest.getByRole("heading", { name: "Il tuo appuntamento" }),
  ).toBeVisible();
  expect(new URL(guest.url()).hash).toBe("");
  await expect(guest.getByText("Elena")).toHaveCount(0);
  await expect(guest.getByText("Consulenza iniziale")).toHaveCount(0);
  expect((await f.row()).status).toBe("booked");
  await capture(guest, "open", 375);
  await capture(guest, "open", 1280);
  await guest
    .getByRole("button", { name: "Conferma appuntamento", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", {
      name: "Appuntamento confermato",
      exact: true,
    }),
  ).toBeVisible();
  expect((await f.row()).status).toBe("confirmed");
  await expect(
    guest.getByRole("heading", {
      name: "Appuntamento confermato",
      exact: true,
    }),
  ).toBeFocused();
  await capture(guest, "confirmed", 375);
  await guest
    .getByRole("button", { name: "Disdici appuntamento", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Vuoi disdire questo appuntamento?" }),
  ).toBeVisible();
  expect((await f.row()).status).toBe("confirmed");
  await expect(
    guest.getByRole("heading", { name: "Vuoi disdire questo appuntamento?" }),
  ).toBeFocused();
  await guest
    .getByRole("button", { name: "Mantieni appuntamento", exact: true })
    .focus();
  await guest
    .getByRole("button", { name: "Mantieni appuntamento", exact: true })
    .press("Enter");
  await expect(
    guest.getByRole("button", { name: "Disdici appuntamento", exact: true }),
  ).toBeFocused();
  await guest
    .getByRole("button", { name: "Disdici appuntamento", exact: true })
    .press("Enter");
  await expect(
    guest.getByRole("heading", { name: "Vuoi disdire questo appuntamento?" }),
  ).toBeFocused();
  await capture(guest, "cancel-review", 375);
  await guest
    .getByRole("button", { name: "Conferma disdetta", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Appuntamento disdetto", exact: true }),
  ).toBeVisible();
  expect((await f.row()).status).toBe("cancelled");
  await expect(
    guest.getByRole("heading", { name: "Appuntamento disdetto", exact: true }),
  ).toBeFocused();
  await capture(guest, "cancelled", 1280);
  const events = await page.request.get(
    `/api/appointments/${f.appointment.id}/response-links`,
  );
  expect(
    (await events.json()).events.map((e: { action: string }) => e.action),
  ).toEqual(["cancel", "confirm"]);
  await context.close();
});
test("lost cancellation response freezes the action and retry is idempotent", async ({
  page,
  browser,
}) => {
  const f = await scenario(page);
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/appuntamento#${f.link.token}`);
  await guest
    .getByRole("button", { name: "Disdici appuntamento", exact: true })
    .click();
  const keys: string[] = [];
  await guest.route("**/api/appointment-response/submit", async (route) => {
    keys.push(route.request().postDataJSON().request_id);
    await route.fetch();
    await route.abort("failed");
  });
  await guest
    .getByRole("button", { name: "Conferma disdetta", exact: true })
    .click();
  await expect(
    guest.getByRole("button", { name: "Riprova la stessa richiesta" }),
  ).toBeVisible();
  expect((await f.row()).status).toBe("cancelled");
  await expect(
    guest.getByRole("button", { name: "Riprova la stessa richiesta" }),
  ).toBeFocused();
  await expect(
    guest.getByRole("button", { name: "Conferma appuntamento", exact: true }),
  ).toHaveCount(0);
  await capture(guest, "uncertain", 375);
  await guest.unroute("**/api/appointment-response/submit");
  guest.on("request", (r) => {
    if (r.url().endsWith("/api/appointment-response/submit"))
      keys.push(r.postDataJSON().request_id);
  });
  await guest
    .getByRole("button", { name: "Riprova la stessa richiesta" })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Appuntamento disdetto", exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const events = await page.request.get(
    `/api/appointments/${f.appointment.id}/response-links`,
  );
  expect((await events.json()).events).toHaveLength(1);
  await context.close();
});
test("rescheduled and revoked links cannot mutate an appointment", async ({
  page,
}) => {
  const f = await scenario(page);
  const moved = await page.request.patch(
    `/api/appointments/${f.appointment.id}`,
    {
      headers: origin,
      data: {
        version: 1,
        starts_at: new Date(Date.now() + 5 * 86400000).toISOString(),
        ends_at: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
      },
    },
  );
  expect(moved.status()).toBe(200);
  const denied = await page.request.post("/api/appointment-response/submit", {
    headers: origin,
    data: {
      token: f.link.token,
      action: "cancel",
      request_id: crypto.randomUUID(),
    },
  });
  expect(denied.status()).toBe(410);
  await page.goto(`/appuntamento#${f.link.token}`);
  await expect(
    page.getByRole("heading", { name: "Collegamento non disponibile" }),
  ).toBeVisible();
  await capture(page, "unavailable", 375);
  const fresh = await page.request.post(
    `/api/appointments/${f.appointment.id}/response-links`,
    {
      headers: origin,
      data: { request_id: crypto.randomUUID(), appointment_version: 2 },
    },
  );
  expect(fresh.status()).toBe(201);
  const next = await fresh.json();
  const revoked = await page.request.delete(
    `/api/appointments/${f.appointment.id}/response-links`,
    { headers: origin, data: { link_id: next.id } },
  );
  expect(revoked.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/appointment-response/read", {
        headers: origin,
        data: { token: next.token },
      })
    ).status(),
  ).toBe(410);
  expect((await f.row()).status).toBe("booked");
});
test("cancellation policy is owner-only and enforced after the page opens", async ({
  page,
  browser,
}) => {
  const f = await scenario(page);
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/appuntamento#${f.link.token}`);
  await guest
    .getByRole("button", { name: "Disdici appuntamento", exact: true })
    .click();
  const updated = await page.request.put(
    "/api/appointment-response/preferences",
    { headers: origin, data: { notice_hours: 168 } },
  );
  expect(updated.status()).toBe(200);
  await guest
    .getByRole("button", { name: "Conferma disdetta", exact: true })
    .click();
  await expect(
    guest.getByRole("alert").filter({ hasText: "termine per disdire" }),
  ).toBeVisible();
  expect((await f.row()).status).toBe("booked");
  await guest
    .getByRole("button", { name: "Conferma appuntamento", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Appuntamento confermato" }),
  ).toBeVisible();
  await page.goto("/app/promemoria");
  await page.getByLabel("Anticipo minimo per disdire online (ore)").fill("24");
  await page.getByRole("button", { name: "Salva regola di disdetta" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Regola di disdetta salvata" }),
  ).toBeVisible();
  await capture(page, "policy", 820);
  const outsider = await account();
  const denied = await outsider.db.rpc("manage_appointment_action_links", {
    p_appointment_id: f.appointment.id,
  });
  expect(denied.error?.code).toBe("P0002");
  expect(
    (
      await guest.request.put("/api/appointment-response/preferences", {
        headers: origin,
        data: { notice_hours: 0 },
      })
    ).status(),
  ).toBe(401);
  await context.close();
});
test("concurrent cancellation and rescheduling cannot cancel the new schedule", async ({
  page,
}) => {
  const f = await scenario(page);
  const [cancel, move] = await Promise.all([
    page.request.post("/api/appointment-response/submit", {
      headers: origin,
      data: {
        token: f.link.token,
        action: "cancel",
        request_id: crypto.randomUUID(),
      },
    }),
    page.request.patch(`/api/appointments/${f.appointment.id}`, {
      headers: origin,
      data: {
        version: 1,
        starts_at: new Date(Date.now() + 5 * 86400000).toISOString(),
        ends_at: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
      },
    }),
  ]);
  expect([
    [200, 409],
    [410, 200],
  ]).toContainEqual([cancel.status(), move.status()]);
  expect((await f.row()).status).toBe(
    cancel.status() === 200 ? "cancelled" : "booked",
  );
});
test("agenda issues a personal link, records client events and revokes access", async ({
  page,
}) => {
  const f = await scenario(page);
  await page.goto("/app/agenda");
  await page.getByRole("combobox", { name: "Vista calendario" }).click();
  await page.getByRole("option", { name: "Mese", exact: true }).click();
  await page
    .getByText("Elena Risposta di prova", { exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Crea link personale", exact: true })
    .click();
  const field = page.getByLabel("Link personale da condividere");
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  expect(url).toContain("/appuntamento#");
  await capture(page, "agenda-panel", 1280);
  await expect(
    page.getByRole("link", { name: "Apri WhatsApp con il link" }),
  ).toHaveAttribute("href", /https:\/\/wa.me\//);
  await page
    .getByRole("button", { name: "Revoca collegamento", exact: true })
    .click();
  await expect(field).toHaveCount(0);
  const r = await page.request.post("/api/appointment-response/read", {
    headers: origin,
    data: { token: new URL(url).hash.slice(1) },
  });
  expect(r.status()).toBe(410);
  expect((await f.row()).status).toBe("booked");
});
test("network loss disables actions without queuing a response", async ({
  page,
  browser,
}) => {
  const f = await scenario(page);
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/appuntamento#${f.link.token}`);
  await expect(
    guest.getByRole("button", { name: "Conferma appuntamento", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    guest.getByRole("button", { name: "Conferma appuntamento", exact: true }),
  ).toBeDisabled();
  expect((await f.row()).status).toBe("booked");
  await context.setOffline(false);
  await expect(
    guest.getByRole("button", { name: "Conferma appuntamento", exact: true }),
  ).toBeEnabled();
  expect((await f.row()).status).toBe("booked");
  await context.close();
});
