import { expect, test } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { account, login, origin } from "./helpers";
import type { Workspace } from "@/lib/types";

test("unauthenticated requests cannot read application data", async ({
  request,
}) => {
  const response = await request.get("/api/clients");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const invalid = await request.post("/api/clients", {
    data: { first_name: "A", last_name: "B", email: "", phone: "" },
  });
  expect(invalid.status()).toBe(403); // No Origin: CSRF rejected even before session handling.
});

test("onboarding creates one workspace even after retry", async ({ page }) => {
  const user = await account(false);
  await login(page, user);
  await page.getByLabel("Il tuo nome").fill("Francesca Verdi");
  await page.getByLabel("Nome dello studio").fill("Studio Verdi");
  await page.getByLabel("Nome della sede").fill("Sede principale");
  await page.getByLabel("Nome del servizio").fill("Prima consulenza");
  await page.getByRole("button", { name: "Apri la mia agenda" }).click();
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  const before = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  const retry = await page.request.post("/api/workspace", {
    headers: origin,
    data: {
      name: "Retry studio",
      display_name: "Retry owner",
      location: "Retry sede",
      service: "Retry servizio",
      duration: 60,
      price: 0,
    },
  });
  expect(retry.status()).toBe(201);
  const after = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  expect(after.tenant.id).toBe(before.tenant.id);
  expect(after.locations).toHaveLength(1);
  expect(after.services).toHaveLength(1);
});

test("clients and appointments persist through the real interface", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: "Nuova cliente", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Elena");
  await page.getByLabel("Cognome", { exact: true }).fill("Rossi");
  await page.getByLabel("Telefono", { exact: false }).fill("3331234567");
  await page.getByRole("button", { name: "Salva cliente" }).click();
  await expect(
    page.getByRole("button", { name: "Elena Rossi", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Elena Rossi", exact: true }),
  ).toBeVisible();
  await page.goto("/app/agenda");
  await page
    .getByRole("button", { name: "Nuovo appuntamento", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await page.getByRole("option", { name: "Elena Rossi" }).click();
  const day = Temporal.Now.zonedDateTimeISO("Europe/Rome")
    .toPlainDate()
    .toString();
  await page.getByLabel("Data e ora").fill(`${day}T10:00`);
  await page
    .getByRole("button", { name: "Prenota appuntamento", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Un nuovo appuntamento" }),
  ).not.toBeVisible();
  const event = page
    .getByRole("region", { name: "Calendario appuntamenti" })
    .getByRole("button", { name: /Elena Rossi/ });
  await expect(event).toBeVisible();
  await event.click();
  await expect(
    page.getByRole("link", { name: "Apri WhatsApp" }),
  ).toHaveAttribute("href", /https:\/\/wa.me\/393331234567\?text=/);
  await expect(
    page.getByRole("link", { name: "Apri WhatsApp" }),
  ).toHaveAttribute("target", "_blank");
  await page
    .getByRole("button", { name: "Modifica appuntamento", exact: true })
    .click();
  await page.getByLabel("Data e ora").fill(`${day}T12:00`);
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Modifica appuntamento" }),
  ).not.toBeVisible();
  const start = Temporal.PlainDate.from(day)
    .toZonedDateTime("Europe/Rome")
    .toInstant()
    .toString();
  const end = Temporal.PlainDate.from(day)
    .add({ days: 1 })
    .toZonedDateTime("Europe/Rome")
    .toInstant()
    .toString();
  const appointments = await (
    await page.request.get(
      `/api/appointments?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    )
  ).json();
  expect(appointments).toHaveLength(1);
  expect(appointments[0].version).toBe(2);
  for (const view of ["Giorno", "Mese", "Lista", "Settimana"]) {
    await page.getByRole("combobox", { name: "Vista calendario" }).click();
    await page.getByRole("option", { name: view, exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Calendario appuntamenti" })
        .getByText("Elena Rossi", { exact: true }),
    ).toBeVisible();
  }
});

test("concurrent creation and edits preserve database invariants", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  const clientResponse = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: "Race", last_name: "Fixture", email: "", phone: "" },
  });
  const client = await clientResponse.json();
  expect(clientResponse.status()).toBe(201);
  const data = {
    client_id: client.id,
    service_id: workspace.services[0].id,
    location_id: workspace.locations[0].id,
    operator_id: user.id,
    starts_at: "2099-01-01T10:00:00Z",
    ends_at: "2099-01-01T11:00:00Z",
    price_cents: 5000,
  };
  const key = crypto.randomUUID();
  const [a, b] = await Promise.all(
    [0, 1].map(() =>
      page.request.post("/api/appointments", {
        headers: { ...origin, "Idempotency-Key": key },
        data,
      }),
    ),
  );
  expect(a.status()).toBe(201);
  expect(b.status()).toBe(201);
  const first = await a.json();
  expect((await b.json()).id).toBe(first.id);
  const conflict = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(conflict.status()).toBe(409);
  const edits = await Promise.all(
    [6000, 7000].map((price_cents) =>
      page.request.patch(`/api/appointments/${first.id}`, {
        headers: origin,
        data: { version: 1, price_cents },
      }),
    ),
  );
  expect(edits.map((r) => r.status()).sort()).toEqual([200, 409]);
});

test("tenant isolation applies to API and direct Supabase requests", async ({
  browser,
}) => {
  const userA = await account();
  const userB = await account();
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await login(pageA, userA);
  const created = await pageA.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "Private",
      last_name: "Tenant A",
      email: "",
      phone: "",
    },
  });
  const client = await created.json();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await login(pageB, userB);
  expect((await pageB.request.get(`/api/clients/${client.id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await pageB.request.patch(`/api/clients/${client.id}`, {
        headers: origin,
        data: {
          version: 1,
          first_name: "Attack",
          last_name: "B",
          email: "",
          phone: "",
        },
      })
    ).status(),
  ).toBe(404);
  const direct = await userB.db
    .from("clients")
    .select("id")
    .eq("id", client.id);
  expect(direct.error).toBeNull();
  expect(direct.data).toEqual([]);
  const injected = await pageB.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "X",
      last_name: "Y",
      email: "",
      phone: "",
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  });
  expect(injected.status()).toBe(422);
  await contextA.close();
  await contextB.close();
});

test("catalog edits preserve the price of appointments already booked", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  const client = await (
    await page.request.post("/api/clients", {
      headers: origin,
      data: {
        first_name: "History",
        last_name: "Fixture",
        email: "",
        phone: "",
      },
    })
  ).json();
  const appointment = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      client_id: client.id,
      service_id: workspace.services[0].id,
      location_id: workspace.locations[0].id,
      operator_id: user.id,
      starts_at: "2099-01-02T10:00:00Z",
      ends_at: "2099-01-02T11:00:00Z",
      price_cents: 5000,
    },
  });
  expect(appointment.status()).toBe(201);
  const edited = await page.request.patch(
    `/api/services/${workspace.services[0].id}`,
    {
      headers: origin,
      data: {
        name: "Servizio aggiornato",
        duration_minutes: 90,
        price_cents: 9900,
        color: "#71618d",
        active: true,
      },
    },
  );
  expect(edited.status()).toBe(200);
  const saved = await user.db
    .from("appointments")
    .select("price_cents,service_name")
    .eq("id", (await appointment.json()).id)
    .single();
  expect(saved.data?.price_cents).toBe(5000);
  expect(saved.data?.service_name).toBe("Consulenza iniziale");
});

test("mobile pages fit the viewport and logout removes access", async ({
  page,
}) => {
  const user = await account();
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, user);
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  for (const route of [
    "/app/agenda",
    "/app/clienti",
    "/app/catalogo",
    "/app/impostazioni",
  ]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: /Giulia Bianchi/ }).click();
  await page.getByRole("menuitem", { name: "Esci dal tuo account" }).click();
  await expect(page).toHaveURL(/accedi/);
  expect((await page.request.get("/api/clients")).status()).toBe(401);
});
