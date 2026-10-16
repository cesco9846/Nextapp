import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { clinicalScenario, holdClinicalTenant } from "./clinical-helpers";
import {
  issueSignature,
  readSignature,
  signBody,
  fillSignature,
  documentList,
  documentSql,
} from "./documents-helpers";
import { intakeAdmin } from "./intake-helpers";

test("client reviews pinned answers and labels, signs with keyboard, and the professional downloads a real private PDF", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page
    .getByRole("button", { name: "Genera link di firma", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Collegamento per la firma",
    exact: true,
  });
  await expect(field).toHaveValue(/\/firma#[a-f0-9]{64}$/);
  const link = await field.inputValue(),
    token = new URL(link).hash.slice(1);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const html = await client.request.get("/firma");
  expect(html.status()).toBe(200);
  expect(await html.text()).not.toContain(token);
  expect(html.headers()["referrer-policy"]).toBe("no-referrer");
  expect(html.headers()["cache-control"]).toContain("no-store");
  expect((await client.request.head("/firma")).status()).toBe(200);
  expect((await client.request.get("/api/consent/read")).status()).toBe(405);
  await client.goto(link);
  await expect(
    client.getByRole("heading", { name: "Il tuo consenso al trattamento" }),
  ).toBeVisible();
  await expect(client).toHaveURL(/\/firma$/);
  await expect(
    client.getByText("Nota sintetica riservata", { exact: true }),
  ).toBeVisible();
  await expect(
    client.getByText("Lotto DEMO-01", { exact: false }),
  ).toBeVisible();
  await client
    .getByRole("button", { name: "Visualizza etichetta", exact: true })
    .click();
  const image = client.getByRole("img", {
    name: "Etichetta del lotto scelto per questo trattamento",
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  expect((await client.request.get("/api/clients")).status()).toBe(401);
  await expect(client.getByRole("navigation")).toHaveCount(0);
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(client.locator("p[role=alert]")).toContainText(
    "Scrivi nome e cognome",
  );
  await fillSignature(client);
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
  expect(
    await client.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("Nota sintetica");
  await expect
    .poll(
      async () =>
        (await documentList(page, f.appointment.id)).documents[0]
          ?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
  const doc = (await documentList(page, f.appointment.id)).documents[0];
  const pdf = await page.request.post(`/api/consents/${doc.id}/download`, {
    headers: origin,
    data: {},
  });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const bytes = await pdf.body();
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: bytes,
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  for (const expected of [
    "Elena di prova",
    "Nota sintetica riservata",
    "DEMO-01",
    "Etichetta sintetica",
    f.consent.body.body,
    doc.content_hash,
  ])
    expect(text).toContain(expected);
  const other = await account();
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, other);
  expect(
    (
      await otherPage.request.post(`/api/consents/${doc.id}/download`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await client.request.post("/api/consent/read", {
        headers: origin,
        data: { token },
      })
    ).status(),
  ).toBe(410);
  await ctx.close();
  await otherContext.close();
});

test("lost signing response preserves the exact attempt and retry returns one receipt without resigning", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueSignature(page, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await client.goto(`/firma#${issued.token}`);
  await fillSignature(client);
  let calls = 0;
  const bodies: string[] = [];
  await client.route("**/api/consent/sign", async (route) => {
    calls++;
    bodies.push(route.request().postData()!);
    if (calls === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(client.locator("p[role=alert]")).toContainText(
    "L’esito dell’invio non è confermato",
  );
  await expect(client.getByLabel("Il tuo nome e cognome")).toBeDisabled();
  await client
    .getByRole("button", { name: "Riprova invio", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
  expect(bodies[0]).toBe(bodies[1]);
  expect((await documentList(page, f.appointment.id)).documents).toHaveLength(
    1,
  );
  await ctx.close();
});

test("concurrent distinct signing requests consume one capability and cannot replace handwriting", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueSignature(page, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const context = await readSignature(client, issued.token!);
  const body = signBody(issued.token!, context);
  const results = await Promise.all(
    [
      body,
      { ...body, request_id: crypto.randomUUID(), signer_name: "Altro nome" },
    ].map((data) =>
      client.request.post("/api/consent/sign", { headers: origin, data }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 410]);
  expect((await documentList(page, f.appointment.id)).documents).toHaveLength(
    1,
  );
  await ctx.close();
});

test("crash after PDF upload resumes the immutable artifact without another signature", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueSignature(page, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const context = await readSignature(client, issued.token!);
  const body = signBody(issued.token!, context);
  documentSql(
    `create function public.test_fail_document_finalize() returns trigger language plpgsql as $$ begin if new.appointment_id='${f.appointment.id}' and new.document_state='ready' then raise exception 'SYNTHETIC_FINALIZATION_FAILURE'; end if; return new;end; $$; create trigger test_fail_document_finalize before update on public.consents for each row execute function public.test_fail_document_finalize();`,
  );
  let id = "",
    hash = "";
  try {
    const signed = await client.request.post("/api/consent/sign", {
      headers: origin,
      data: body,
    });
    expect(signed.status()).toBe(200);
    id = (await signed.json()).receipt.id;
    await expect
      .poll(
        async () =>
          (await documentList(page, f.appointment.id)).documents[0]
            ?.document_state,
        { timeout: 30000 },
      )
      .toBe("failed");
    hash = (await documentList(page, f.appointment.id)).documents[0]
      .content_hash;
    expect(
      documentSql(
        `select count(*) from storage.objects where bucket_id='glow-documents' and name like '%/${id}/glow-pdf-v1.pdf'`,
      ),
    ).toBe("1");
  } finally {
    documentSql(
      "drop trigger test_fail_document_finalize on public.consents;drop function public.test_fail_document_finalize();",
    );
  }
  const changed = await page.request.post(
    `/api/appointments/${f.appointment.id}/preparation`,
    {
      headers: origin,
      data: {
        ...f.preparationBody,
        request_id: crypto.randomUUID(),
        version: 1,
        answers: { [f.anam.question]: "Risposta nuova, successiva alla firma" },
      },
    },
  );
  expect(changed.status()).toBe(200);
  expect(
    (
      await page.request.post(`/api/consents/${id}/process`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () =>
        (await documentList(page, f.appointment.id)).documents[0]
          ?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
  const doc = (await documentList(page, f.appointment.id)).documents[0];
  expect(doc.id).toBe(id);
  expect(doc.content_hash).toBe(hash);
  const pdf = await page.request.post(`/api/consents/${id}/download`, {
    headers: origin,
    data: {},
  });
  expect(pdf.status()).toBe(200);
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: await pdf.body(),
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  expect(text).toContain("Nota sintetica riservata");
  expect(text).not.toContain("Risposta nuova");
  const newRequest = await issueSignature(page, f.appointment.id, 2);
  const review = await readSignature(client, newRequest.token!);
  expect(review.snapshot.answers[f.anam.question]).toBe(
    "Risposta nuova, successiva alla firma",
  );
  const next = await client.request.post("/api/consent/sign", {
    headers: origin,
    data: signBody(newRequest.token!, review),
  });
  expect(next.status()).toBe(200);
  const docs = (await documentList(page, f.appointment.id)).documents;
  expect(docs).toHaveLength(2);
  const linked = await f.owner.db
    .from("consents")
    .select("previous_id")
    .eq("id", (await next.json()).receipt.id)
    .single();
  expect(linked.data?.previous_id).toBe(id);
  await ctx.close();
});

test("revision changes, expiration and revocation reject signing without creating documents", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  const stale = await issueSignature(page, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const review = await readSignature(client, stale.token!);
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
          },
        },
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await client.request.post("/api/consent/sign", {
        headers: origin,
        data: signBody(stale.token!, review),
      })
    ).status(),
  ).toBe(410);
  const revoked = await issueSignature(page, f.appointment.id, 2);
  expect(
    (
      await page.request.delete(`/api/signature-requests/${revoked.link.id}`, {
        headers: origin,
        data: { version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await client.request.post("/api/consent/read", {
        headers: origin,
        data: { token: revoked.token },
      })
    ).status(),
  ).toBe(410);
  const expired = await issueSignature(page, f.appointment.id, 2);
  expect(
    (
      await intakeAdmin
        .from("consent_requests")
        .update({
          created_at: new Date(Date.now() - 7200000).toISOString(),
          expires_at: new Date(Date.now() - 3600000).toISOString(),
        })
        .eq("id", expired.link.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await client.request.post("/api/consent/read", {
        headers: origin,
        data: { token: expired.token },
      })
    ).status(),
  ).toBe(410);
  expect((await documentList(page, f.appointment.id)).documents).toHaveLength(
    0,
  );
  await ctx.close();
});

test("clinical revocation wins over a signature waiting on the tenant lock", async ({
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
  const colleagueContext = await browser.newContext();
  const colleague = await colleagueContext.newPage();
  await login(colleague, staff);
  const issued = await issueSignature(colleague, f.appointment.id);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const review = await readSignature(client, issued.token!);
  const tenant = (
    await staff.db.from("users").select("tenant_id").eq("id", staff.id).single()
  ).data!.tenant_id;
  const lock = await holdClinicalTenant(tenant);
  try {
    const pending = client.request.post("/api/consent/sign", {
      headers: origin,
      data: signBody(issued.token!, review),
    });
    await expect
      .poll(() =>
        Number(
          documentSql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%use_signature_request%'",
          ),
        ),
      )
      .toBeGreaterThan(0);
    await lock.revoke(
      f.owner.id,
      f.appointment.client_id,
      staff.id,
      assignment.data!.version,
    );
    expect((await pending).status()).toBe(410);
    expect((await documentList(page, f.appointment.id)).documents).toHaveLength(
      0,
    );
  } finally {
    lock.close();
    await ctx.close();
    await colleagueContext.close();
  }
});

test("tablet signing requires professional login again and offline input is never queued", async ({
  page,
  context,
}) => {
  const f = await clinicalScenario(page, true);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page
    .getByRole("button", { name: "Firma su tablet", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Lo studio verrà disconnesso",
  );
  await page
    .getByRole("button", { name: "Disconnetti e apri firma", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Il tuo consenso al trattamento" }),
  ).toBeVisible();
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  await fillSignature(page);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Connessione assente",
  );
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
  await page.goto("/app/agenda");
  await expect(page).toHaveURL(/\/accedi/);
});

test("an incomplete tablet handoff response discards the professional view after server logout", async ({
  page,
}) => {
  const f = await clinicalScenario(page, true);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page.route(
    `**/api/appointments/${f.appointment.id}/consents/tablet`,
    async (route) => {
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      await route.fulfill({ response: r, body: '{"link":' });
    },
  );
  await page
    .getByRole("button", { name: "Firma su tablet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnetti e apri firma", exact: true })
    .click();
  await expect(page).toHaveURL(/\/accedi/);
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  await expect(
    page.getByRole("heading", { name: "Bentornata nel tuo studio" }),
  ).toBeVisible();
});
