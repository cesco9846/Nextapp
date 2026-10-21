import { spawn } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { appointment, clinicalScenario } from "./clinical-helpers";
import { documentSql } from "./documents-helpers";
import { authorizePhotos } from "./photos-helpers";
import { intakeAdmin } from "./intake-helpers";
import { cleanupPrivacyExports } from "@/documents/privacy-cleanup";

async function contact(page: Page, first = "Elena gestione") {
  const response = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: first, last_name: "Sintetica", email: "", phone: "" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; version: number };
}
async function service(page: Page) {
  const response = await page.request.post("/api/services", {
    headers: origin,
    data: {
      name: "Servizio eliminabile sintetico",
      duration_minutes: 30,
      price_cents: 2500,
      color: "#28664f",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as {
    id: string;
    version: number;
    name: string;
  };
}
async function remove(
  page: Page,
  kind: "clients" | "services",
  id: string,
  version = 1,
) {
  return page.request.delete(`/api/${kind}/${id}`, {
    headers: origin,
    data: { version, confirmation: "ELIMINA" },
  });
}

test("owner renames studio from settings at phone/tablet/desktop widths; offline and stale saves are rejected", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  await page.goto("/app/impostazioni");
  await page.getByRole("button", { name: "Modifica nome studio" }).click();
  await page
    .getByLabel("Nome dello studio", { exact: true })
    .fill("Studio Aurora sintetico");
  for (const width of [375, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Salva nome studio" }),
    ).toBeInViewport();
  }
  await page.context().setOffline(true);
  await expect(
    page.getByRole("button", { name: "Salva nome studio" }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Salva nome studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Studio Aurora sintetico", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("aside").getByText("Studio Aurora sintetico", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.patch("/api/workspace", {
        headers: origin,
        data: { name: "Stale overwrite", version: 1 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await user.db.from("tenants").select("name").single()).data?.name,
  ).toBe("Studio Aurora sintetico");
});

test("renaming studio preserves the exact signed payload and its generated PDF", async ({
  page,
}) => {
  const f = await clinicalScenario(page, true);
  const receipt = await authorizePhotos(page, f.appointment.id);
  await expect
    .poll(
      async () =>
        (
          await f.owner.db
            .from("consents")
            .select("document_state")
            .eq("id", receipt.id)
            .single()
        ).data?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
  const before = await page.request.post(
    `/api/consents/${receipt.id}/download`,
    { headers: origin, data: {} },
  );
  expect(before.status()).toBe(200);
  const bytes = await before.body();
  const hash = documentSql(
    `select content_hash from public.consents where id='${receipt.id}';`,
  );
  expect(
    (
      await page.request.patch("/api/workspace", {
        headers: origin,
        data: { name: "Nome successivo sintetico", version: 1 },
      })
    ).status(),
  ).toBe(200);
  const after = await page.request.post(
    `/api/consents/${receipt.id}/download`,
    { headers: origin, data: {} },
  );
  expect(after.status()).toBe(200);
  expect(await after.body()).toEqual(bytes);
  expect(
    documentSql(
      `select payload->'snapshot'->>'studio' from app_private.signed_payloads where consent_id='${receipt.id}';`,
    ),
  ).toBe("Studio di prova");
  expect(
    documentSql(
      `select content_hash from public.consents where id='${receipt.id}';`,
    ),
  ).toBe(hash);
});

test("unused client deletion requires typed confirmation and clears the actual record and cached list", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const c = await contact(page);
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: /Apri scheda di Elena gestione/ })
    .click();
  await page
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", {
    name: "Elimina cliente definitivamente",
  });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Annulla", exact: true }),
  ).toBeFocused();
  await dialog.getByLabel("Scrivi ELIMINA per confermare").fill("ELIMINA");
  await page.context().setOffline(true);
  await expect(confirm).toBeDisabled();
  await page.context().setOffline(false);
  await confirm.click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Apri scheda di Elena gestione/ }),
  ).toHaveCount(0);
  expect(
    (await user.db.from("clients").select("id").eq("id", c.id)).data,
  ).toEqual([]);
  expect((await remove(page, "clients", c.id)).status()).toBe(200);
});

test("unused service can be removed from its editor; another service remains available", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const s = await service(page);
  await page.goto("/app/catalogo");
  await page
    .getByRole("button", { name: `Modifica ${s.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Elimina servizio", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("button", { name: "Elimina servizio definitivamente" }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Elimina servizio definitivamente" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(s.name, { exact: true })).toHaveCount(0);
  expect(
    (await user.db.from("services").select("id").eq("id", s.id)).data,
  ).toEqual([]);
  expect((await user.db.from("services").select("id")).data).toHaveLength(1);
});

test("a client edited while confirmation is open must be reviewed again before deletion", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const c = await contact(page, "Cliente revisione");
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: /Apri scheda di Cliente revisione/ })
    .click();
  await page
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Scrivi ELIMINA per confermare").fill("ELIMINA");
  expect(
    (
      await page.request.patch(`/api/clients/${c.id}`, {
        headers: origin,
        data: {
          version: 1,
          first_name: "Nuova revisione",
          last_name: "Sintetica",
          email: "",
          phone: "",
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(
    dialog.getByText(/Questo elemento è stato modificato/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Elimina cliente definitivamente" }),
  ).toHaveCount(0);
  expect(
    (await user.db.from("clients").select("first_name").eq("id", c.id).single())
      .data?.first_name,
  ).toBe("Nuova revisione");
});

test("cancelled appointment protects both client and service; service can still be deactivated", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const a = await appointment(page, user);
  expect(
    (
      await page.request.patch(`/api/appointments/${a.id}`, {
        headers: origin,
        data: { version: 1, status: "cancelled" },
      })
    ).status(),
  ).toBe(200);
  const s = (await user.db.from("services").select("*").single()).data!;
  expect((await remove(page, "clients", a.client_id)).status()).toBe(409);
  expect((await remove(page, "services", s.id)).status()).toBe(409);
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: /Apri scheda di Elena Di prova/ })
    .click();
  await page
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog").getByText("Eliminazione bloccata"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Elimina cliente definitivamente" }),
  ).toHaveCount(0);
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await page.goto("/app/catalogo");
  await page
    .getByRole("button", { name: `Modifica ${s.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Elimina servizio", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog").getByText(/anche passati o annullati/),
  ).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Disponibile per nuove prenotazioni" })
    .uncheck();
  await page
    .getByRole("button", { name: "Salva servizio", exact: true })
    .click();
  await expect(page.getByText("Non attivo", { exact: true })).toBeVisible();
  expect(
    (await user.db.from("appointments").select("id").eq("id", a.id)).data,
  ).toHaveLength(1);
});

test("a service linked only to an inactive clinical template remains protected", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const s = (await user.db.from("services").select("*").single()).data!;
  const response = await page.request.post("/api/clinical/templates", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      template_id: null,
      version: 0,
      kind: "consent",
      title: "Modello sintetico",
      body: "Testo dimostrativo per il test, non valido per trattamenti.",
      questions: [],
      service_id: s.id,
    },
  });
  expect(response.status()).toBe(201);
  documentSql(
    `update public.clinical_templates set active=false where service_id='${s.id}';`,
  );
  const status = await (
    await page.request.get(`/api/services/${s.id}/deletion`)
  ).json();
  expect(status.reasons).toContain("clinical_templates");
  expect((await remove(page, "services", s.id)).status()).toBe(409);
});

test("a new booking after preflight blocks deletion at confirmation without losing the appointment", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const c = await contact(page, "Cliente concorrenza");
  const preflight = await page.request.get(`/api/clients/${c.id}/deletion`);
  expect((await preflight.json()).allowed).toBe(true);
  const s = (await user.db.from("services").select("id").single()).data!;
  const l = (await user.db.from("locations").select("id").single()).data!;
  const start = new Date(Date.now() + 3 * 86400000);
  const booking = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      client_id: c.id,
      service_id: s.id,
      location_id: l.id,
      operator_id: user.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(booking.status()).toBe(201);
  expect((await remove(page, "clients", c.id)).status()).toBe(409);
  expect((await remove(page, "services", s.id)).status()).toBe(409);
  expect((await user.db.from("appointments").select("id")).data).toHaveLength(
    1,
  );
});

test("a revoked export must actually be cleaned before its unused client can be deleted", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const c = await contact(page, "Cliente export");
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: c.id },
      })
    ).status(),
  ).toBe(201);
  const copy = await page.request.get(`/api/privacy/exports/${id}`);
  expect(copy.status()).toBe(200);
  const bytes = await copy.body();
  expect((await remove(page, "clients", c.id)).status()).toBe(409);
  expect(
    (
      await page.request.delete(`/api/privacy/exports/${id}`, {
        headers: origin,
      })
    ).status(),
  ).toBe(200);
  expect((await remove(page, "clients", c.id)).status()).toBe(409);
  await cleanupPrivacyExports(intakeAdmin, AbortSignal.timeout(10000), 10);
  expect((await remove(page, "clients", c.id)).status()).toBe(200);
  expect(
    (
      await user.db
        .from("privacy_exports")
        .select("client_id")
        .eq("id", id)
        .single()
    ).data?.client_id,
  ).toBeNull();
  const overview = await page.request.get("/api/privacy");
  expect(overview.status()).toBe(200);
  expect(
    (await overview.json()).exports.some(
      (entry: { id: string }) => entry.id === id,
    ),
  ).toBe(false);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const path = `${tenant}/${id}/archive.zip`;
  // Simulate an upload completing after its first cleanup and contact removal.
  expect(
    (
      await intakeAdmin.storage
        .from("glow-exports")
        .upload(path, bytes, { contentType: "application/zip" })
    ).error,
  ).toBeNull();
  expect(
    (await cleanupPrivacyExports(intakeAdmin, AbortSignal.timeout(10000), 10))
      .completed,
  ).toBeGreaterThan(0);
  expect(
    (await intakeAdmin.storage.from("glow-exports").download(path)).error,
  ).not.toBeNull();
});

test("only owners can rename or delete, foreign records stay isolated and CSRF is rejected", async ({
  page,
  browser,
}) => {
  const owner = await account();
  await login(page, owner);
  const c = await contact(page);
  const s = (await owner.db.from("services").select("*").single()).data!;
  expect(
    (
      await page.request.delete(`/api/clients/${c.id}`, {
        data: { version: 1, confirmation: "ELIMINA" },
      })
    ).status(),
  ).toBe(403);
  const foreign = await account();
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, foreign);
  expect(
    (await other.request.get(`/api/clients/${c.id}/deletion`)).status(),
  ).toBe(404);
  expect((await remove(other, "services", s.id)).status()).toBe(404);
  const operator = await account(false);
  const tenant = (await owner.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  expect(
    (
      await intakeAdmin.from("users").insert({
        id: operator.id,
        tenant_id: tenant,
        display_name: "Operatrice sintetica",
        role: "operator",
        clinical_access: true,
      })
    ).error,
  ).toBeNull();
  await login(other, operator);
  expect(
    (
      await other.request.patch("/api/workspace", {
        headers: origin,
        data: { name: "No owner", version: 1 },
      })
    ).status(),
  ).toBe(403);
  expect((await remove(other, "clients", c.id)).status()).toBe(403);
  expect(
    (
      await operator.db.rpc("delete_unused_resource", {
        p_kind: "services",
        p_id: s.id,
        p_version: 1,
        p_confirmation: "ELIMINA",
      })
    ).error?.code,
  ).toBe("42501");
  await other.goto("/app/impostazioni");
  await expect(
    other.getByRole("button", { name: "Modifica nome studio" }),
  ).toHaveCount(0);
  await context.clearCookies();
  expect(
    (await other.request.get(`/api/services/${s.id}/deletion`)).status(),
  ).toBe(401);
  await context.close();
});

test("owner suspension committed while deletion waits on the tenant lock prevents the deletion", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const c = await contact(page);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const lock = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_Nextapp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  lock.stdout.on("data", (chunk) => (output += String(chunk)));
  const exited = new Promise((resolve) => lock.on("close", resolve));
  try {
    lock.stdin.write(
      `begin;select id from public.tenants where id='${tenant}' for update;\n\\echo management-locked\n`,
    );
    await expect.poll(() => output.includes("management-locked")).toBe(true);
    const deleting = remove(page, "clients", c.id);
    await expect
      .poll(() =>
        Number(
          documentSql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%delete_unused_resource%';",
          ),
        ),
      )
      .toBeGreaterThan(0);
    lock.stdin.end(
      `update public.users set active=false where id='${user.id}';commit;\n`,
    );
    expect(await exited).toBe(0);
    expect((await deleting).status()).toBe(403);
    expect(
      documentSql(`select count(*) from public.clients where id='${c.id}';`),
    ).toBe("1");
  } finally {
    if (!lock.stdin.writableEnded) lock.stdin.end("rollback;\n");
    await exited;
  }
});
