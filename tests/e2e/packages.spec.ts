import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  packageFixture,
  issuePacket,
  packetCall,
  answersFor,
  signPacket,
  writing,
} from "./packages-helpers";
import { origin, account, login } from "./helpers";
import { documentSql, documentList } from "./documents-helpers";
import { defaultPackages } from "@/lib/packages";
import { formatDate, formatTime } from "@/lib/dates";

test("native adult packet keeps separate health, questionnaire, signatures, real PDF and private export evidence", async ({
  page,
  browser,
}) => {
  const f = await packageFixture(page);
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  const html = await client.request.get("/documento");
  expect(html.status()).toBe(200);
  expect(html.headers()["cache-control"]).toContain("no-store");
  expect(html.headers()["referrer-policy"]).toBe("no-referrer");
  expect(await html.text()).not.toContain(token);
  await client.goto(`/documento#${token}`);
  await expect(
    client.getByRole("heading", {
      name: "Privacy e dati relativi alla salute",
    }),
  ).toBeVisible();
  await expect(client).toHaveURL(/\/documento$/);
  const appointmentTime = documentSql(
    `select starts_at from public.appointments where id='${f.appt.id}'`,
  );
  const appointmentLabel = `Appuntamento: ${formatDate(appointmentTime, "Europe/Rome", { year: "numeric" })} alle ${formatTime(appointmentTime, "Europe/Rome")} (Europe/Rome)`;
  await expect(
    client.getByText(appointmentLabel, { exact: false }),
  ).toBeVisible();
  expect((await client.request.get("/api/clients")).status()).toBe(401);
  const premature = await client.request.post("/api/packets/access", {
    headers: origin,
    data: {
      token,
      action: "answers",
      input: { answers: answersFor(f.content) },
    },
  });
  expect(premature.status()).toBe(410);
  await client
    .getByRole("button", { name: "Acconsento ai dati sanitari", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Dichiarazioni pre-trattamento" }),
  ).toBeVisible();
  for (const q of f.content.questions.filter((q) => q.type === "yes_no")) {
    await client
      .getByLabel(
        new RegExp(q.label.slice(0, 35).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      )
      .click();
    await client.getByRole("option", { name: "No", exact: true }).click();
  }
  await client
    .getByRole("button", { name: "Invia risposte e controlla il documento" })
    .click();
  await expect(
    client.getByRole("heading", { name: "Le risposte da verificare" }),
  ).toBeVisible();
  let c = await packetCall(client.request, token, "read");
  const signed = signPacket(c);
  c = await packetCall(client.request, token, "sign", signed);
  expect(c.stage).toBe("signed");
  expect((await packetCall(client.request, token, "sign", signed)).stage).toBe(
    "signed",
  );
  expect((await documentList(page, f.appt.id)).documents).toHaveLength(0);
  const current = (
    await (
      await page.request.get(`/api/appointments/${f.appt.id}/packets`)
    ).json()
  ).sessions[0];
  expect(current.ready_to_countersign).toBe(true);
  const counter = {
    snapshot_hash: current.snapshot_hash,
    confirmed: true,
    signature: writing,
  };
  let r = await page.request.post(`/api/packets/${issued.id}`, {
    headers: origin,
    data: counter,
  });
  expect(r.status(), await r.text()).toBe(200);
  const doc = await r.json();
  expect(
    (
      await page.request.post(`/api/packets/${issued.id}`, {
        headers: origin,
        data: counter,
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(
      async () =>
        (await documentList(page, f.appt.id)).documents[0]?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
  r = await page.request.post(`/api/consents/${doc.id}/download`, {
    headers: origin,
    data: {},
  });
  expect(r.status()).toBe(200);
  const bytes = await r.body();
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: bytes,
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  for (const value of [
    "Microblading",
    "Dati dello studio",
    "Indicazioni post-trattamento",
    "Titolare sintetico",
    "Dati relativi alla salute",
    "Controfirma",
    "Giulia Bianchi",
    "Elena Di prova",
    "glow-pdf-v3",
  ])
    expect(text.toLowerCase()).toContain(value.toLowerCase());
  expect(
    documentSql(
      `select count(*) from public.photo_permissions where consent_id='${doc.id}' and not allowed and image_scope='none'`,
    ),
  ).toBe("2");
  const exportId = crypto.randomUUID();
  r = await page.request.post("/api/privacy/exports", {
    headers: origin,
    data: { id: exportId, client_id: f.appt.client_id },
  });
  expect(r.status(), await r.text()).toBe(201);
  expect(
    documentSql(
      `select jsonb_array_length(payload->'consent_packets') from app_private.privacy_export_payloads where export_id='${exportId}'`,
    ),
  ).toBe("1");
  const cached = await client.evaluate(
    () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
  );
  expect(cached).not.toContain("privacy_notice");
  expect(cached).not.toContain(token);
  await ctx.close();
});

test("two verified parents consent before health answers, both sign same snapshot and most restrictive photo scope wins", async ({
  page,
}) => {
  const f = await packageFixture(page, true, true, "lipblush");
  const issued = await issuePacket(page, f);
  const [one, two] = issued.links.map((l) => l.token);
  expect(
    (await packetCall(page.request, one, "health", { allowed: true })).stage,
  ).toBe("waiting");
  expect(
    (await packetCall(page.request, two, "health", { allowed: true })).stage,
  ).toBe("waiting");
  expect((await packetCall(page.request, one, "read")).stage).toBe("answers");
  const c = await packetCall(page.request, one, "answers", {
    answers: answersFor(f.content),
  });
  expect(c.stage).toBe("sign");
  const c2 = await packetCall(page.request, two, "read");
  expect(c2.snapshot_hash).toBe(c.snapshot_hash);
  await packetCall(page.request, one, "sign", signPacket(c, "recognizable"));
  const early = await page.request.post(`/api/packets/${issued.id}`, {
    headers: origin,
    data: {
      snapshot_hash: c.snapshot_hash,
      confirmed: true,
      signature: writing,
    },
  });
  expect(early.status()).toBe(400);
  await packetCall(page.request, two, "sign", signPacket(c2, "detail"));
  const r = await page.request.post(`/api/packets/${issued.id}`, {
    headers: origin,
    data: {
      snapshot_hash: c.snapshot_hash,
      confirmed: true,
      signature: writing,
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  const doc = await r.json();
  expect(
    documentSql(
      `select image_scope from public.photo_permissions where consent_id='${doc.id}' and purpose='demonstration'`,
    ),
  ).toBe("detail");
  await expect
    .poll(
      async () =>
        (await documentList(page, f.appt.id)).documents[0]?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
  const pdf = await page.request.post(`/api/consents/${doc.id}/download`, {
    headers: origin,
    data: {},
  });
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: await pdf.body(),
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  for (const value of [
    "Genitore sintetico 1",
    "Genitore sintetico 2",
    "Persona rappresentata: Elena Di prova",
    "Solo dettaglio area trattata",
  ])
    expect(text).toContain(value);
});

test("refusal does not store health answers, does not cancel appointment and cannot be converted to consent by retry", async ({
  page,
}) => {
  const f = await packageFixture(page);
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  expect(
    (await packetCall(page.request, token, "health", { allowed: false })).stage,
  ).toBe("declined");
  const r = await page.request.post("/api/packets/access", {
    headers: origin,
    data: { token, action: "health", input: { allowed: true } },
  });
  expect(r.status()).toBe(410);
  expect(
    (
      await page.request.post("/api/packets/access", {
        headers: origin,
        data: {
          token,
          action: "answers",
          input: { answers: answersFor(f.content) },
        },
      })
    ).status(),
  ).toBe(410);
  expect(
    documentSql(
      `select answers::text from app_private.preparation_answers where preparation_id=(select preparation_id from public.consent_requests where id='${issued.id}')`,
    ),
  ).toBe("{}");
  expect(
    (
      await f.owner.db
        .from("appointments")
        .select("status")
        .eq("id", f.appt.id)
        .single()
    ).data?.status,
  ).toBe("booked");
});

test("minor requirements are enforced at RPC boundary; originals and legacy signing routes cannot bypass them", async ({
  page,
}) => {
  const f = await packageFixture(page, true, true);
  const base = {
    request_id: crypto.randomUUID(),
    appointment_version: f.appt.version,
    package_version_id: f.published.published_version_id,
    lot_ids: [],
    mode: "link",
  };
  for (const details of [
    { ...f.details, representatives: [] },
    { ...f.details, date_of_birth: "2015-01-01" },
    {
      ...f.details,
      representatives: f.details.representatives.map((p) => ({
        ...p,
        verified: false,
      })),
    },
  ]) {
    const r = await page.request.post(
      `/api/appointments/${f.appt.id}/packets`,
      { headers: origin, data: { ...base, details } },
    );
    expect([400, 422]).toContain(r.status());
  }
  const issued = await issuePacket(page, f);
  const preparation = (
    await f.owner.db
      .from("treatment_preparations")
      .select("*")
      .eq("appointment_id", f.appt.id)
      .single()
  ).data!;
  for (const rpc of [
    "create_signature_request",
    "create_intake_link",
  ] as const) {
    const r = await f.owner.db.rpc(rpc, {
      p_request_id: crypto.randomUUID(),
      p_appointment_id: f.appt.id,
      p_appointment_version: f.appt.version,
      p_preparation_version: preparation.version,
      p_mode: "link",
    });
    expect(r.error?.message).toBe("PACKAGE_FLOW_REQUIRED");
  }
  const changed = await f.owner.db.rpc("save_treatment_preparation", {
    p_request_id: crypto.randomUUID(),
    p_appointment_id: f.appt.id,
    p_appointment_version: f.appt.version,
    p_version: preparation.version,
    p_consent_version_id: preparation.consent_version_id,
    p_anamnesis_version_id: preparation.anamnesis_version_id!,
    p_answers: {},
    p_lot_ids: [],
  });
  expect(changed.error?.message).toBe("PACKAGE_FLOW_REQUIRED");
  expect(issued.links).toHaveLength(2);
});

test("draft import is idempotent, publication requires review, operator and foreign callers are denied, CSRF rejected", async ({
  page,
  browser,
}) => {
  const f = await packageFixture(page);
  const again = await page.request.post("/api/clinical/packages", {
    headers: origin,
    data: {
      id: null,
      version: 0,
      service_id: f.appt.service_id,
      content: f.content,
    },
  });
  expect((await again.json()).id).toBe(f.saved.id);
  const saved = await page.request.post("/api/clinical/packages", {
    headers: origin,
    data: {
      id: f.published.id,
      version: f.published.version,
      service_id: f.appt.service_id,
      content: { ...f.content, reviewed: false },
    },
  });
  const data = await saved.json();
  expect(saved.status()).toBe(201);
  expect(
    (
      await page.request.post("/api/clinical/packages/publish", {
        headers: origin,
        data: { id: data.id, version: data.version },
      })
    ).status(),
  ).toBe(400);
  const foreign = await account();
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await login(other, foreign);
  expect(
    (
      await other.request.get(`/api/appointments/${f.appt.id}/packets`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(`/api/packets/${crypto.randomUUID()}`, {
        headers: origin,
        data: {
          snapshot_hash: "a".repeat(64),
          confirmed: true,
          signature: writing,
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post("/api/clinical/packages/publish", {
        headers: { Origin: "https://foreign.invalid" },
        data: { id: data.id, version: data.version },
      })
    ).status(),
  ).toBe(403);
  const template = (
    await f.owner.db
      .from("clinical_templates")
      .select("id")
      .eq("package_id", f.published.id)
      .eq("kind", "consent")
      .single()
  ).data!;
  const hidden = await foreign.db.rpc("publish_clinical_template", {
    p_request_id: crypto.randomUUID(),
    p_template_id: template.id,
    p_version: 1,
    p_kind: "consent",
    p_title: "Testo sintetico",
    p_body: "Contenuto sintetico per verifica isolamento",
    p_questions: [],
    p_service_id: (await foreign.db.from("services").select("id").single())
      .data!.id,
  });
  expect(hidden.error?.code).toBe("P0002");
  const denied = await foreign.db.rpc("use_consent_packet", {
    p_token_hash: "a".repeat(64),
    p_action: "read",
  });
  expect(denied.error).not.toBeNull();
  expect(
    defaultPackages.map(
      (p) => p.questions.filter((q) => q.type === "yes_no").length,
    ),
  ).toEqual([13, 14]);
  await ctx.close();
});

test("rotation, client edits and explicit revocation invalidate capabilities without destroying evidence", async ({
  page,
}) => {
  const f = await packageFixture(page);
  let issued = await issuePacket(page, f);
  let token = issued.links[0].token;
  const state = (
    await (
      await page.request.get(`/api/appointments/${f.appt.id}/packets`)
    ).json()
  ).sessions[0];
  const rotated = await page.request.post(
    `/api/packets/parties/${state.parties[0].id}`,
    { headers: origin, data: {} },
  );
  expect(rotated.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/packets/access", {
        headers: origin,
        data: { token, action: "read" },
      })
    ).status(),
  ).toBe(410);
  token = (await rotated.json()).token;
  await packetCall(page.request, token, "health", { allowed: true });
  const revoked = await page.request.delete(
    `/api/signature-requests/${issued.id}`,
    { headers: origin, data: { version: state.version } },
  );
  expect(revoked.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/packets/access", {
        headers: origin,
        data: { token, action: "read" },
      })
    ).status(),
  ).toBe(410);
  issued = await issuePacket(page, f);
  token = issued.links[0].token;
  const client = await f.owner.db
    .from("clients")
    .select("*")
    .eq("id", f.appt.client_id)
    .single();
  await page.request.patch(`/api/clients/${f.appt.client_id}`, {
    headers: origin,
    data: {
      first_name: "Nome cambiato",
      last_name: "Di prova",
      email: "",
      phone: "",
      version: client.data!.version,
    },
  });
  expect(
    (
      await page.request.post("/api/packets/access", {
        headers: origin,
        data: { token, action: "read" },
      })
    ).status(),
  ).toBe(410);
  expect(
    documentSql(
      `select count(*) from app_private.consent_packet_parties where packet_id='${state.id}' and health is not null`,
    ),
  ).toBe("1");
});

test("native editor and preparation remain usable on phone, tablet and desktop, with offline actions disabled", async ({
  page,
  context,
}) => {
  const f = await packageFixture(page, true, true);
  for (const width of [375, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/documenti/predefiniti");
    await expect(
      page.getByRole("heading", { name: "Moduli predefiniti", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Modifica bozza", exact: true })
      .click();
    await expect(
      page.getByLabel("Informativa privacy dello studio"),
    ).toHaveValue(f.content.privacy_notice);
    await page
      .getByRole("button", { name: "Annulla modifica pacchetto" })
      .click();
    await page.goto(`/app/appuntamenti/${f.appt.id}/preparazione`);
    await page
      .getByRole("button", {
        name: "Usa un modulo predefinito per questa seduta",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Prepara il modulo predefinito" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Aggiungi rappresentante", exact: true })
      .click();
    await expect(
      page.getByLabel("Nome e cognome · rappresentante 1", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Crea link personali del modulo" }),
  ).toBeDisabled();
  await context.setOffline(false);
  expect(
    documentSql(
      `select count(*) from app_private.consent_packets where client_id='${f.appt.client_id}'`,
    ),
  ).toBe("0");
});

test("committed issuer suspension while a signature waits for tenant lock prevents collection", async ({
  page,
}) => {
  const { spawn } = await import("node:child_process");
  const f = await packageFixture(page);
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  const c = await packetCall(page.request, token, "answers", {
    answers: answersFor(f.content),
  });
  const tenant = (
    await f.owner.db
      .from("users")
      .select("tenant_id")
      .eq("id", f.owner.id)
      .single()
  ).data!.tenant_id;
  const blocker = spawn(
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
  let out = "";
  blocker.stdout.on("data", (b) => (out += b.toString()));
  const exit = new Promise((resolve) => blocker.on("close", resolve));
  blocker.stdin.write(
    `begin;select id from public.tenants where id='${tenant}' for update;\n\\echo packet-locked\n`,
  );
  try {
    await expect.poll(() => out.includes("packet-locked")).toBe(true);
    const pending = page.request.post("/api/packets/access", {
      headers: origin,
      data: { token, action: "sign", input: signPacket(c) },
    });
    await expect
      .poll(() =>
        Number(
          documentSql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%use_consent_packet%'",
          ),
        ),
      )
      .toBeGreaterThan(0);
    blocker.stdin.end(
      `update public.users set active=false where id='${f.owner.id}';commit;\n`,
    );
    expect(await exit).toBe(0);
    expect((await pending).status()).toBe(410);
    expect(
      documentSql(
        `select count(*) from app_private.consent_packet_parties where packet_id='${issued.id}' and signature is not null`,
      ),
    ).toBe("0");
  } finally {
    if (!blocker.stdin.writableEnded) blocker.stdin.end("rollback;\n");
  }
});

test("lost successful signature response retries exactly once and does not permit edits or duplicate signatures", async ({
  page,
  browser,
}) => {
  const f = await packageFixture(page);
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  await packetCall(page.request, token, "answers", {
    answers: answersFor(f.content),
  });
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await client.goto(`/documento#${token}`);
  await expect(
    client.getByRole("heading", { name: "Le risposte da verificare" }),
  ).toBeVisible();
  const checks = client.getByRole("checkbox");
  await checks.nth(2).check();
  await checks.nth(3).check();
  await checks.nth(4).check();
  const canvas = client.locator("canvas");
  await canvas.focus();
  await client.keyboard.press("Enter");
  for (let i = 0; i < 8; i++) {
    await client.keyboard.press("ArrowRight");
    await client.keyboard.press(i % 2 === 0 ? "ArrowDown" : "ArrowUp");
  }
  await client.keyboard.press("Enter");
  let fail = true;
  await client.route("**/api/packets/access", async (route) => {
    const b = route.request().postDataJSON();
    if (fail && b.action === "sign") {
      fail = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await client
    .getByRole("button", { name: "Firma il modulo e conferma le scelte" })
    .click();
  await expect(
    client.getByRole("button", { name: "Riprova lo stesso invio" }),
  ).toBeVisible();
  await expect(checks.nth(2)).toBeDisabled();
  await client.getByRole("button", { name: "Riprova lo stesso invio" }).click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
  expect(
    documentSql(
      `select count(*) from app_private.consent_packet_parties where packet_id='${issued.id}' and signature is not null`,
    ),
  ).toBe("1");
  await ctx.close();
});

test("tablet handoff signs out the studio for each representative, while the other party link remains usable", async ({
  page,
  browser,
}) => {
  const f = await packageFixture(page, true, true);
  const issued = await issuePacket(page, f);
  const states = await (
    await page.request.get(`/api/appointments/${f.appt.id}/packets`)
  ).json();
  const party = states.sessions[0].parties[0];
  const r = await page.request.post(`/api/packets/parties/${party.id}`, {
    headers: origin,
    data: { tablet: true },
  });
  expect(r.status()).toBe(200);
  const fresh = await r.json();
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  await page.goto(`/documento#${fresh.token}`);
  await expect(
    page.getByRole("heading", { name: "Privacy e dati relativi alla salute" }),
  ).toBeVisible();
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  await page.goto(`/documento#${issued.links[1].token}`);
  await expect(
    page.getByText(/Firmatario: Genitore sintetico 2/),
  ).toBeVisible();
  const other = await browser.newContext();
  const p = await other.newPage();
  expect(
    (await packetCall(p.request, issued.links[1].token, "read")).signer_name,
  ).toBe("Genitore sintetico 2");
  await other.close();
});

test("age transition across appointment date is held for a fresh adult consent, and affirmative health answers require details", async ({
  page,
}) => {
  const f = await packageFixture(page, true);
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setUTCFullYear(tomorrow.getUTCFullYear() - 18);
  const date = tomorrow.toISOString().slice(0, 10);
  const r = await page.request.post(`/api/appointments/${f.appt.id}/packets`, {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      appointment_version: f.appt.version,
      package_version_id: f.published.published_version_id,
      details: { ...f.details, date_of_birth: date, representatives: [] },
      lot_ids: [],
      mode: "link",
    },
  });
  expect(r.status()).toBe(400);
  expect((await r.json()).error).toContain("compleanno");
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  const answers = answersFor(f.content);
  answers[f.content.questions[0].id] = true;
  const invalid = await page.request.post("/api/packets/access", {
    headers: origin,
    data: { token, action: "answers", input: { answers } },
  });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).code).toBe("DETAILS_REQUIRED");
  const detail = f.content.questions.find((q) => q.type === "text")!;
  answers[detail.id] =
    "Spiegazione sintetica da valutare dalla professionista.";
  expect(
    (await packetCall(page.request, token, "answers", { answers })).stage,
  ).toBe("sign");
});

test("native public label preview serves only pinned, verified files and is revoked with the packet", async ({
  page,
  browser,
}) => {
  const { createHash } = await import("node:crypto");
  const { labelImage } = await import("./clinical-helpers");
  const f = await packageFixture(page);
  let r = await page.request.post("/api/clinical/pigments", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      brand: "Linea sintetica",
      name: "Colore di prova",
      code: "TEST",
      active: true,
    },
  });
  expect(r.status()).toBe(201);
  const pigment = await r.json();
  const image = await labelImage();
  r = await page.request.post(`/api/clinical/pigments/${pigment.id}/labels`, {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      size_bytes: image.length,
      sha256: createHash("sha256").update(image).digest("hex"),
      mime_type: "image/jpeg",
    },
  });
  expect(r.status()).toBe(201);
  const label = await r.json();
  expect(
    (
      await f.owner.db.storage
        .from("glow-private")
        .upload(label.upload_path, image, {
          contentType: "image/jpeg",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  expect(
    (
      await page.request.post(`/api/files/${label.id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
  r = await page.request.post("/api/clinical/lots", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      pigment_id: pigment.id,
      lot_number: "NATIVE-TEST-01",
      expires_on: "2035-12-31",
      label_file_id: label.id,
      label_text: "Etichetta sintetica di prova",
      active: true,
    },
  });
  expect(r.status()).toBe(201);
  const lot = await r.json();
  const issued = await issuePacket(page, f, { lot_ids: [lot.id] });
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  await packetCall(page.request, token, "answers", {
    answers: answersFor(f.content),
  });
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await client.goto(`/documento#${token}`);
  await client
    .getByRole("button", { name: "Visualizza etichetta", exact: true })
    .click();
  await expect(
    client.getByRole("img", {
      name: "Etichetta del lotto scelto per questo trattamento",
    }),
  ).toBeVisible();
  const denied = await client.request.post("/api/packets/label", {
    headers: origin,
    data: { token, id: crypto.randomUUID() },
  });
  expect(denied.status()).toBe(410);
  const state = (
    await (
      await page.request.get(`/api/appointments/${f.appt.id}/packets`)
    ).json()
  ).sessions[0];
  expect(
    (
      await page.request.delete(`/api/signature-requests/${issued.id}`, {
        headers: origin,
        data: { version: state.version },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await client.request.post("/api/packets/label", {
        headers: origin,
        data: { token, id: label.id },
      })
    ).status(),
  ).toBe(410);
  await ctx.close();
});

test("assigned clinical operator can see packets but cannot manage library or counter-sign another practitioner appointment", async ({
  page,
  browser,
}) => {
  const f = await packageFixture(page);
  const member = await account(false);
  const tenant = (
    await f.owner.db
      .from("users")
      .select("tenant_id")
      .eq("id", f.owner.id)
      .single()
  ).data!.tenant_id;
  documentSql(
    `insert into public.users(id,tenant_id,display_name,role,clinical_access) values('${member.id}','${tenant}','Operatrice sintetica','operator',true);insert into public.client_assignments(tenant_id,client_id,operator_id,assigned_by) values('${tenant}','${f.appt.client_id}','${member.id}','${f.owner.id}')`,
  );
  const ctx = await browser.newContext();
  const operator = await ctx.newPage();
  await login(operator, member);
  expect((await operator.request.get("/api/clinical/packages")).status()).toBe(
    403,
  );
  expect(
    (
      await operator.request.get(`/api/appointments/${f.appt.id}/packets`)
    ).status(),
  ).toBe(200);
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  const c = await packetCall(page.request, token, "answers", {
    answers: answersFor(f.content),
  });
  await packetCall(page.request, token, "sign", signPacket(c));
  expect(
    (
      await operator.request.post(`/api/packets/${issued.id}`, {
        headers: origin,
        data: {
          snapshot_hash: c.snapshot_hash,
          confirmed: true,
          signature: writing,
        },
      })
    ).status(),
  ).toBe(403);
  await ctx.close();
});

test("counter-signature recovers a lost response and exposes the PDF without reloading a newly prepared appointment", async ({
  page,
}) => {
  const f = await packageFixture(page);
  await page.goto(`/app/appuntamenti/${f.appt.id}/preparazione`);
  await page
    .getByRole("button", {
      name: "Usa un modulo predefinito per questa seduta",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Prepara il modulo predefinito" }),
  ).toBeVisible();
  const issued = await issuePacket(page, f);
  const token = issued.links[0].token;
  await packetCall(page.request, token, "health", { allowed: true });
  const c = await packetCall(page.request, token, "answers", {
    answers: answersFor(f.content),
  });
  await packetCall(page.request, token, "sign", signPacket(c));
  await page
    .getByRole("button", { name: "Aggiorna stato firme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Verifica risposte e controfirma" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verifica e controfirma", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  const canvas = page.locator("canvas");
  await canvas.focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(i % 2 === 0 ? "ArrowDown" : "ArrowUp");
  }
  await page.keyboard.press("Enter");
  let fail = true;
  await page.route(`**/api/packets/${issued.id}`, async (route) => {
    if (fail && route.request().method() === "POST") {
      fail = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Controfirma e genera PDF" }).click();
  await expect(
    page.getByRole("button", { name: "Riprova controfirma" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chiudi verifica" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Riprova controfirma" }).click();
  await expect(
    page.getByRole("button", { name: "Scarica PDF", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Scarica PDF", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("consenso-glow.pdf");
  expect((await documentList(page, f.appt.id)).documents).toHaveLength(1);
});
