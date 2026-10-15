import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { clinicalScenario, holdClinicalTenant } from "./clinical-helpers";
import {
  fillIntake,
  intakeAdmin,
  issueIntake,
  waitingIntakeRequests,
} from "./intake-helpers";
import type { ClinicalTemplate, PreparationContext } from "@/lib/clinical";

test("professional creates a personal link and the client reads only pinned texts and submits through the real interface", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page
    .getByRole("button", { name: "Genera collegamento", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Collegamento personale",
    exact: true,
  });
  await expect(field).toHaveValue(/\/compila#[a-f0-9]{64}$/);
  const link = await field.inputValue();
  const token = new URL(link).hash.slice(1);
  const metadata = await page.request.get(
    `/api/appointments/${f.appointment.id}/intake`,
  );
  const id = (await metadata.json()).items[0].id as string;
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const html = await client.request.get("/compila");
  expect(html.status()).toBe(200);
  expect(await html.text()).not.toContain(token);
  expect(html.headers()["referrer-policy"]).toBe("no-referrer");
  expect(html.headers()["cache-control"]).toContain("no-store");
  expect((await client.request.head("/compila")).status()).toBe(200);
  expect((await client.request.get("/api/intake/read")).status()).toBe(405);
  expect(
    (
      await f.owner.db
        .from("intake_links")
        .select("used_at")
        .eq("id", id)
        .single()
    ).data!.used_at,
  ).toBeNull();
  const list = await page.request.get("/api/clinical/templates?kind=consent");
  const template = (await list.json()).items[0] as ClinicalTemplate;
  expect(
    (
      await page.request.post("/api/clinical/templates", {
        headers: origin,
        data: {
          ...f.consent.body,
          request_id: crypto.randomUUID(),
          template_id: template.id,
          version: template.version,
          body: "Nuovo testo sintetico: non sostituisce quello già scelto.",
        },
      })
    ).status(),
  ).toBe(201);
  const urls: string[] = [];
  client.on("request", (r) =>
    urls.push(new URL(r.url()).pathname + new URL(r.url()).search),
  );
  await client.goto(link);
  await expect(
    client.getByRole("heading", { name: "Prima del tuo appuntamento" }),
  ).toBeVisible();
  await expect(client).toHaveURL(/\/compila$/);
  expect(urls.every((url) => !url.includes(token))).toBe(true);
  await expect(
    client
      .getByRole("region", { name: "Consenso dimostrativo" })
      .getByText(f.consent.body.body, { exact: true }),
  ).toBeVisible();
  await expect(
    client.getByText("Nota sintetica riservata", { exact: true }),
  ).not.toBeVisible();
  await expect(client.getByRole("navigation")).toHaveCount(0);
  expect((await client.request.get("/api/clients")).status()).toBe(401);
  await client
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  await expect(
    client.getByRole("alert").filter({ hasText: "Conferma di avere letto" }),
  ).toBeVisible();
  await fillIntake(client);
  await client
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Compilazione ricevuta" }),
  ).toBeVisible();
  expect(
    await client.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("Risposta cliente sintetica");
  const saved = await page.request.post(
    `/api/appointments/${f.appointment.id}/preparation/read`,
    { headers: origin, data: {} },
  );
  const c = (await saved.json()) as PreparationContext;
  expect(c.answers[f.anam.question]).toBe("Risposta cliente sintetica");
  expect(c.preparation!.version).toBe(2);
  expect(c.preparation!.status).toBe("draft");
  expect(
    (
      await client.request.post("/api/intake/read", {
        headers: origin,
        data: { token },
      })
    ).status(),
  ).toBe(410);
  await ctx.close();
});

test("two concurrent client submissions consume one link and only an identical retry returns its receipt", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueIntake(page, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const bodies = ["A", "B"].map((answer) => ({
    token: issued.token,
    request_id: crypto.randomUUID(),
    confirm_read: true,
    answers: { [f.anam.question]: `Risposta concorrente ${answer}` },
  }));
  const results = await Promise.all(
    bodies.map((data) =>
      client.request.post("/api/intake/submit", { headers: origin, data }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 410]);
  const winner = results.findIndex((r) => r.status() === 200);
  const receipt = (await results[winner].json()).receipt;
  const retry = await client.request.post("/api/intake/submit", {
    headers: origin,
    data: bodies[winner],
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).receipt).toEqual(receipt);
  expect(
    (
      await client.request.post("/api/intake/submit", {
        headers: origin,
        data: {
          ...bodies[winner],
          answers: { [f.anam.question]: "Modifica non consentita" },
        },
      })
    ).status(),
  ).toBe(410);
  const r = await page.request.post(
    `/api/appointments/${f.appointment.id}/preparation/read`,
    { headers: origin, data: {} },
  );
  const c = (await r.json()) as PreparationContext;
  expect(c.preparation!.version).toBe(2);
  expect(c.answers).toEqual(bodies[winner].answers);
  await ctx.close();
});

test("revocation, expiry and appointment or preparation changes invalidate links without exposing another studio", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const read = (token: string | null) =>
    client.request.post("/api/intake/read", {
      headers: origin,
      data: { token },
    });
  const revoked = await issueIntake(page, f.appointment.id);
  expect(
    (
      await page.request.delete(`/api/intake-links/${revoked.link.id}`, {
        headers: origin,
        data: { version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect((await read(revoked.token)).status()).toBe(410);
  const expired = await issueIntake(page, f.appointment.id);
  expect(
    (
      await intakeAdmin
        .from("intake_links")
        .update({
          created_at: new Date(Date.now() - 120000).toISOString(),
          expires_at: new Date(Date.now() - 60000).toISOString(),
        })
        .eq("id", expired.link.id)
    ).error,
  ).toBeNull();
  expect((await read(expired.token)).status()).toBe(410);
  const changed = await issueIntake(page, f.appointment.id);
  expect(
    (
      await page.request.post(
        `/api/appointments/${f.appointment.id}/preparation`,
        {
          headers: origin,
          data: {
            ...f.preparationBody,
            request_id: crypto.randomUUID(),
            version: 1,
            answers: { [f.anam.question]: "Modifica professionista" },
          },
        },
      )
    ).status(),
  ).toBe(200);
  expect((await read(changed.token)).status()).toBe(410);
  const moved = await issueIntake(page, f.appointment.id, 2);
  expect(
    (
      await f.owner.db.rpc("update_appointment", {
        p_id: f.appointment.id,
        p_version: 1,
        p_data: { status: "confirmed" },
      })
    ).error,
  ).toBeNull();
  expect((await read(moved.token)).status()).toBe(410);
  const other = await account();
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, other);
  const meta = await otherPage.request.get(
    `/api/appointments/${f.appointment.id}/intake`,
  );
  expect((await meta.json()).items).toEqual([]);
  expect(
    (
      await otherPage.request.delete(`/api/intake-links/${moved.link.id}`, {
        headers: origin,
        data: { version: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await otherPage.request.post(
        `/api/appointments/${f.appointment.id}/intake`,
        {
          headers: origin,
          data: {
            request_id: crypto.randomUUID(),
            appointment_version: 2,
            preparation_version: 2,
          },
        },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await f.owner.db.rpc("use_intake_link", {
        p_token_hash: "a".repeat(64),
        p_action: "read",
        p_request_id: null!,
        p_answers: null!,
        p_confirm_read: null!,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await client.request.post("/api/intake/read", {
        data: { token: moved.token },
      })
    ).status(),
  ).toBe(403);
  await ctx.close();
  await otherContext.close();
});

test("assignment revocation wins over an already waiting public submission issued by the clinician", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const staff = await account(false);
  const invitation = await f.owner.db.rpc("create_team_invitation", {
    p_email: staff.email,
    p_clinical_access: true,
  });
  expect(invitation.error).toBeNull();
  expect(
    (
      await staff.db.rpc("accept_team_invitation", {
        p_token: (invitation.data as { token: string }).token,
        p_display_name: "Operatrice sintetica",
      })
    ).error,
  ).toBeNull();
  const ctx = await browser.newContext();
  const colleague = await ctx.newPage();
  await login(colleague, staff);
  expect(
    (
      await colleague.request.post(
        `/api/appointments/${f.appointment.id}/intake`,
        {
          headers: origin,
          data: {
            request_id: crypto.randomUUID(),
            appointment_version: 1,
            preparation_version: 1,
          },
        },
      )
    ).status(),
  ).toBe(404);
  const assignment = await f.owner.db.rpc("set_client_assignment", {
    p_client_id: f.appointment.client_id,
    p_operator_id: staff.id,
    p_assigned: true,
    p_version: 0,
  });
  expect(assignment.error).toBeNull();
  const issued = await issueIntake(colleague, f.appointment.id);
  const tenant = (
    await staff.db.from("users").select("tenant_id").eq("id", staff.id).single()
  ).data!.tenant_id;
  const anon = await browser.newContext();
  const client = await anon.newPage();
  const lock = await holdClinicalTenant(tenant);
  try {
    const pending = client.request.post("/api/intake/submit", {
      headers: origin,
      data: {
        token: issued.token,
        request_id: crypto.randomUUID(),
        confirm_read: true,
        answers: { [f.anam.question]: "Da respingere dopo revoca" },
      },
    });
    await expect.poll(waitingIntakeRequests).toBeGreaterThan(0);
    await lock.revoke(
      f.owner.id,
      f.appointment.client_id,
      staff.id,
      assignment.data!.version,
    );
    expect((await pending).status()).toBe(410);
    expect(
      (
        await client.request.post("/api/intake/read", {
          headers: origin,
          data: { token: issued.token },
        })
      ).status(),
    ).toBe(410);
    expect((await staff.db.from("intake_links").select("id")).data).toEqual([]);
    const audit = await f.owner.db
      .from("audit_log")
      .select("id")
      .eq("action", "intake.submitted")
      .eq("resource_id", issued.link.id);
    expect(audit.data).toHaveLength(0);
    const c = (await (
      await page.request.post(
        `/api/appointments/${f.appointment.id}/preparation/read`,
        { headers: origin, data: {} },
      )
    ).json()) as PreparationContext;
    expect(c.preparation!.version).toBe(1);
    expect(c.answers[f.anam.question]).toBe("Nota sintetica riservata");
  } finally {
    lock.close();
    await ctx.close();
    await anon.close();
  }
});

test("tablet handoff signs out the studio and history or direct URLs require professional login", async ({
  page,
}) => {
  const f = await clinicalScenario(page, true);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/app/clienti");
  await expect(
    page.getByRole("heading", { name: "Le tue clienti", exact: true }),
  ).toBeVisible();
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page
    .getByRole("button", { name: "Modalità cliente su tablet", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Lo studio verrà disconnesso",
  );
  await page
    .getByRole("button", {
      name: "Disconnetti e apri compilazione",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Prima del tuo appuntamento" }),
  ).toBeVisible();
  await expect(
    page.getByText("Modalità cliente", { exact: true }),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).filter((c) =>
      c.name.includes("auth-token"),
    ),
  ).toHaveLength(0);
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  expect((await page.request.get("/api/team")).status()).toBe(401);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await fillIntake(page, "Compilazione sintetica da tablet");
  await page
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Compilazione ricevuta" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/accedi$/);
  await expect(
    page.getByRole("heading", { name: "Le tue clienti", exact: true }),
  ).not.toBeVisible();
  await page.goto("/app/clienti");
  await expect(page).toHaveURL(/\/accedi$/);
  await login(page, f.owner);
  await expect(page).toHaveURL(/\/app\/agenda$/);
});

test("client inputs stay in memory offline and an uncertain response retries the same accepted submission", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueIntake(page, f.appointment.id);
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const client = await ctx.newPage();
  await client.goto(`/compila#${issued.token}`);
  await fillIntake(client, "Risposta solo in memoria");
  let attempts = 0;
  client.on("request", (r) => {
    if (r.url().endsWith("/api/intake/submit")) attempts++;
  });
  await ctx.setOffline(true);
  await client
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  await expect(
    client
      .getByRole("alert")
      .filter({ hasText: "Connessione assente. Riconnettiti" }),
  ).toBeVisible();
  expect(attempts).toBe(0);
  expect(
    await client.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("Risposta solo in memoria");
  await ctx.setOffline(false);
  await expect(
    client.getByText("Glow richiede Internet.", { exact: false }),
  ).not.toBeVisible();
  expect(attempts).toBe(0);
  let accepted: unknown;
  let firstBody: unknown;
  await client.route(
    "**/api/intake/submit",
    async (route) => {
      firstBody = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      accepted = (await response.json()).receipt;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await client
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  await expect(
    client
      .getByRole("alert")
      .filter({ hasText: "La connessione si è interrotta" }),
  ).toBeVisible();
  await expect(
    client.getByLabel("Annotazione dimostrativa (richiesta)", { exact: true }),
  ).toHaveValue("Risposta solo in memoria");
  const retry = client.waitForResponse((r) =>
    r.url().endsWith("/api/intake/submit"),
  );
  await client
    .getByRole("button", { name: "Invia compilazione", exact: true })
    .click();
  const response = await retry;
  expect((await response.json()).receipt).toEqual(accepted);
  expect(response.request().postDataJSON()).toEqual(firstBody);
  await expect(
    client.getByRole("heading", { name: "Compilazione ricevuta" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  const c = (await (
    await page.request.post(
      `/api/appointments/${f.appointment.id}/preparation/read`,
      { headers: origin, data: {} },
    )
  ).json()) as PreparationContext;
  expect(c.preparation!.version).toBe(2);
  await ctx.close();
});

test("an incomplete tablet start response returns to login after the server signs out", async ({
  page,
}) => {
  const f = await clinicalScenario(page, true);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await expect(
    page.getByText("Un nuovo collegamento sostituisce quello già condiviso.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.route(
    `**/api/appointments/${f.appointment.id}/intake/tablet`,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.fulfill({ response, body: "{" });
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Modalità cliente su tablet", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Disconnetti e apri compilazione",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/accedi$/);
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  await expect(
    page.getByRole("heading", { name: "Prepara il trattamento", exact: true }),
  ).not.toBeVisible();
  await page.goto("/app/agenda");
  await expect(page).toHaveURL(/\/accedi$/);
});
