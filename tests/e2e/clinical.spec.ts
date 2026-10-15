import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import {
  appointment,
  clinicalScenario,
  holdClinicalTenant,
  labelImage,
  waitingClinicalRequests,
} from "./clinical-helpers";
import type { ClinicalTemplate, PreparationContext } from "@/lib/clinical";
async function select(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

for (const operation of ["read", "save"] as const) {
  test(`assignment revoked while a clinical ${operation} waits prevents disclosure or mutation`, async ({
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
          p_display_name: "Operatrice di prova",
        })
      ).error,
    ).toBeNull();
    const assignment = await f.owner.db.rpc("set_client_assignment", {
      p_client_id: f.appointment.client_id,
      p_operator_id: staff.id,
      p_assigned: true,
      p_version: 0,
    });
    expect(assignment.error).toBeNull();
    const membership = await staff.db
      .from("users")
      .select("tenant_id")
      .eq("id", staff.id)
      .single();
    const ctx = await browser.newContext();
    const staffPage = await ctx.newPage();
    await login(staffPage, staff);
    const lock = await holdClinicalTenant(membership.data!.tenant_id);
    try {
      const request = staffPage.request.post(
        `/api/appointments/${f.appointment.id}/preparation${operation === "read" ? "/read" : ""}`,
        {
          headers: origin,
          data:
            operation === "read"
              ? {}
              : {
                  ...f.preparationBody,
                  request_id: crypto.randomUUID(),
                  version: 1,
                  answers: {
                    [f.anam.question]: "Scrittura dopo revoca da respingere",
                  },
                },
        },
      );
      await expect.poll(waitingClinicalRequests).toBeGreaterThan(0);
      await lock.revoke(
        f.owner.id,
        f.appointment.client_id,
        staff.id,
        assignment.data!.version,
      );
      expect((await request).status()).toBe(404);
      const result = await page.request.post(
        `/api/appointments/${f.appointment.id}/preparation/read`,
        { headers: origin, data: {} },
      );
      const draft = (await result.json()) as PreparationContext;
      expect(draft.preparation!.version).toBe(1);
      expect(draft.answers[f.anam.question]).toBe("Nota sintetica riservata");
      const audit = await f.owner.db
        .from("audit_log")
        .select("id")
        .eq("actor_id", staff.id)
        .eq("action", "anamnesis.read");
      expect(audit.data).toHaveLength(0);
    } finally {
      lock.close();
      await ctx.close();
    }
  });
}

test("professional publishes models, uploads a lot label and saves an unsigned preparation through the interface", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  await page.goto("/app/impostazioni");
  await page
    .getByRole("link", { name: "Consensi e pigmenti", exact: true })
    .click();
  await page.setViewportSize({ width: 375, height: 812 });
  const tabGroup = page.getByRole("tablist");
  // Measure the whole group in one frame: navigation/scroll anchoring may move
  // the page between separate locator.boundingBox() calls.
  await expect
    .poll(() =>
      tabGroup.evaluate((group) => {
        const bounds = group.getBoundingClientRect();
        const search = document
          .querySelector('input[aria-label="Cerca modello"]')
          ?.getBoundingClientRect();
        return (
          !!search &&
          bounds.bottom <= search.top &&
          Array.from(group.querySelectorAll('[role="tab"]')).every(
            (trigger) => {
              const box = trigger.getBoundingClientRect();
              return (
                box.height >= 44 &&
                box.top >= bounds.top &&
                box.bottom <= bounds.bottom
              );
            },
          )
        );
      }),
    )
    .toBe(true);
  for (const name of ["Consensi", "Anamnesi", "Pigmenti", "Lotti"]) {
    const trigger = page.getByRole("tab", { name, exact: true });
    await trigger.click();
  }
  await page.getByRole("tab", { name: "Consensi", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Nuovo modello" }).click();
  await page.getByLabel("Titolo del modello").fill("Consenso di prova UI");
  await page
    .getByLabel("Testo del consenso")
    .fill("Testo dimostrativo UI, non utilizzabile come consenso reale.");
  await page
    .getByRole("button", { name: "Pubblica versione", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Consenso di prova UI", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Anamnesi", exact: true }).click();
  await page.getByRole("link", { name: "Nuovo modello" }).click();
  await page.getByLabel("Titolo del modello").fill("Questionario di prova UI");
  await page
    .getByLabel("Introduzione al questionario")
    .fill("Domande dimostrative, non destinate a un trattamento reale.");
  await page.getByRole("button", { name: "Aggiungi domanda" }).click();
  await page
    .getByLabel("Domanda 1", { exact: true })
    .fill("Annotazione UI di prova");
  await select(page, "Tipo risposta domanda 1", "Risposta libera");
  await page
    .getByRole("button", { name: "Pubblica versione", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Consensi e pigmenti", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Pigmenti", exact: true }).click();
  await page
    .getByRole("button", { name: "Aggiungi pigmento", exact: true })
    .click();
  await page.getByLabel("Marca", { exact: true }).fill("Marca dimostrativa");
  await page.getByLabel("Nome pigmento", { exact: true }).fill("Pigmento UI");
  await page
    .getByRole("button", { name: "Salva pigmento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pigmento UI", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aggiungi lotto", exact: true })
    .click();
  await page.getByLabel("Numero lotto", { exact: true }).fill("UI-01");
  await page.getByLabel("Scadenza", { exact: true }).fill("2035-12-31");
  await page.getByLabel("Foto dell’etichetta", { exact: true }).setInputFiles({
    name: "etichetta-prova.jpg",
    mimeType: "image/jpeg",
    buffer: await labelImage(),
  });
  await page.getByRole("button", { name: "Salva lotto", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "Lotti", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pigmento UI · UI-01", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apri etichetta", exact: true })
    .click();
  await expect(
    page.getByAltText("Etichetta del lotto selezionato"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const a = await appointment(page, owner);
  await page.goto(`/app/appuntamenti/${a.id}/preparazione`);
  await select(page, "Modello di consenso", "Consenso di prova UI · v1");
  await select(
    page,
    "Questionario di anamnesi",
    "Questionario di prova UI · v1",
  );
  await page
    .getByLabel("Annotazione UI di prova (richiesta alla firma)", {
      exact: true,
    })
    .fill("Risposta UI sintetica");
  await page
    .getByRole("checkbox", { name: "Usa lotto UI-01", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salva preparazione", exact: true })
    .click();
  await expect(
    page.getByText("Bozza salvata · revisione 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Annotazione UI di prova (richiesta alla firma)", {
      exact: true,
    }),
  ).toHaveValue("Risposta UI sintetica");
  await expect(
    page.getByText("Questa preparazione non è un consenso firmato.", {
      exact: false,
    }),
  ).toBeVisible();
  const context = await page.request.post(
    `/api/appointments/${a.id}/preparation/read`,
    { headers: origin, data: {} },
  );
  expect(context.status()).toBe(200);
  const draft = (await context.json()) as PreparationContext;
  expect(draft.lots[0].snapshot.lot_number).toBe("UI-01");
  expect(draft.preparation?.status).toBe("draft");
});

test("published texts and selected lot snapshots survive catalog edits and concurrent preparation saves", async ({
  page,
}) => {
  const f = await clinicalScenario(page, true);
  const writes = await Promise.all(
    ["Prima modifica", "Seconda modifica"].map((text) =>
      page.request.post(`/api/appointments/${f.appointment.id}/preparation`, {
        headers: origin,
        data: {
          ...f.preparationBody,
          version: 1,
          request_id: crypto.randomUUID(),
          answers: { [f.anam.question]: text },
        },
      }),
    ),
  );
  expect(writes.map((r) => r.status()).sort()).toEqual([200, 409]);
  const templates = await page.request.get(
    "/api/clinical/templates?kind=consent",
  );
  const template = (await templates.json()).items[0] as ClinicalTemplate;
  const versions = await Promise.all(
    ["Versione A di prova", "Versione B di prova"].map((body) =>
      page.request.post("/api/clinical/templates", {
        headers: origin,
        data: {
          ...f.consent.body,
          request_id: crypto.randomUUID(),
          template_id: template.id,
          version: template.version,
          body,
        },
      }),
    ),
  );
  expect(versions.map((r) => r.status()).sort()).toEqual([201, 409]);
  const renamed = await page.request.post("/api/clinical/pigments", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: f.pigment.id,
      version: f.pigment.version,
      brand: "Marca aggiornata",
      name: "Nome aggiornato",
      code: "N",
      active: true,
    },
  });
  expect(renamed.status()).toBe(200);
  const read = await page.request.post(
    `/api/appointments/${f.appointment.id}/preparation/read`,
    { headers: origin, data: {} },
  );
  const c = (await read.json()) as PreparationContext;
  expect(c.consent?.id).toBe(f.consent.revision.id);
  expect(c.consent?.body).toBe(f.consent.body.body);
  expect(c.lots[0].snapshot.brand).toBe("Linea di prova");
  expect(c.preparation?.version).toBe(2);
  expect(
    (
      await page.request.post(
        `/api/appointments/${f.appointment.id}/preparation`,
        {
          headers: origin,
          data: {
            ...f.preparationBody,
            request_id: crypto.randomUUID(),
            version: 2,
            answers: { unknown: "Not allowed" },
          },
        },
      )
    ).status(),
  ).toBe(422);
  expect(
    (
      await f.owner.db
        .from("clinical_template_versions")
        .update({ body: "Illicit change" })
        .eq("id", f.consent.revision.id)
    ).error,
  ).not.toBeNull();
});

test("clinical roles, assignment revocation and label scope protect preparations and manufacturer files", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const other = await account();
  const staff = await account(false);
  const invited = await f.owner.db.rpc("create_team_invitation", {
    p_email: staff.email,
    p_clinical_access: false,
  });
  expect(invited.error).toBeNull();
  expect(
    (
      await staff.db.rpc("accept_team_invitation", {
        p_token: (invited.data as { token: string }).token,
        p_display_name: "Staff clinica",
      })
    ).error,
  ).toBeNull();
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await login(staffPage, staff);
  expect(
    (await staffPage.request.get("/api/clinical/templates")).status(),
  ).toBe(403);
  expect((await staff.db.from("clinical_templates").select("id")).data).toEqual(
    [],
  );
  const member = await f.owner.db
    .from("users")
    .select("version")
    .eq("id", staff.id)
    .single();
  expect(
    (
      await f.owner.db.rpc("update_team_member", {
        p_id: staff.id,
        p_version: member.data!.version,
        p_active: true,
        p_clinical_access: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (await staffPage.request.get("/api/clinical/templates")).status(),
  ).toBe(200);
  expect(
    (
      await staffPage.request.post(
        `/api/appointments/${f.appointment.id}/preparation/read`,
        { headers: origin, data: {} },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await staffPage.request.post("/api/clinical/templates", {
        headers: origin,
        data: { ...f.consent.body, request_id: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
  const assignment = await f.owner.db.rpc("set_client_assignment", {
    p_client_id: f.appointment.client_id,
    p_operator_id: staff.id,
    p_assigned: true,
    p_version: 0,
  });
  expect(assignment.error).toBeNull();
  const allowed = await staffPage.request.post(
    `/api/appointments/${f.appointment.id}/preparation/read`,
    { headers: origin, data: {} },
  );
  expect(allowed.status()).toBe(200);
  expect((await allowed.json()).answers[f.anam.question]).toBe(
    "Nota sintetica riservata",
  );
  expect(
    (
      await f.owner.db.rpc("set_client_assignment", {
        p_client_id: f.appointment.client_id,
        p_operator_id: staff.id,
        p_assigned: false,
        p_version: assignment.data!.version,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await staffPage.request.post(
        `/api/appointments/${f.appointment.id}/preparation/read`,
        { headers: origin, data: {} },
      )
    ).status(),
  ).toBe(404);
  expect(
    (await staff.db.from("treatment_preparations").select("id")).data,
  ).toEqual([]);
  const audit = await f.owner.db
    .from("audit_log")
    .select("id")
    .eq("action", "anamnesis.read")
    .eq("actor_id", staff.id);
  expect(audit.data).toHaveLength(1);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, other);
  expect(
    (
      await otherPage.request.post(
        `/api/appointments/${f.appointment.id}/preparation/read`,
        { headers: origin, data: {} },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await otherPage.request.post(`/api/files/${f.label.id}/read`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(404);
  const forged = await page.request.post("/api/clinical/lots", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      pigment_id: crypto.randomUUID(),
      lot_number: "Wrong pigment",
      expires_on: "2035-12-31",
      label_file_id: f.label.id,
      label_text: "",
      active: true,
    },
  });
  expect(forged.status()).toBe(400);
  await context.close();
  await otherContext.close();
});

test("clinical draft inputs survive a connection loss without persistence or a queued save", async ({
  page,
  context,
}) => {
  const f = await clinicalScenario(page, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  const field = page.getByLabel(
    "Annotazione dimostrativa (richiesta alla firma)",
    { exact: true },
  );
  await field.fill("Bozza riservata solo in memoria");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.stringify(localStorage).includes("Bozza riservata"),
    ),
  ).toBe(false);
  let saves = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.url().endsWith(`/api/appointments/${f.appointment.id}/preparation`)
    )
      saves++;
  });
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Salva preparazione", exact: true })
    .click();
  await expect(field).toHaveValue("Bozza riservata solo in memoria");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Connessione assente. Riconnettiti" }),
  ).toBeVisible();
  expect(saves).toBe(0);
  await context.setOffline(false);
  await expect(
    page.getByRole("alert").filter({ hasText: "Glow richiede Internet" }),
  ).not.toBeVisible();
  expect(saves).toBe(0);
  await page
    .getByRole("button", { name: "Salva preparazione", exact: true })
    .click();
  await expect(
    page.getByText("Bozza salvata · revisione 2", { exact: true }),
  ).toBeVisible();
  expect(saves).toBe(1);
});
