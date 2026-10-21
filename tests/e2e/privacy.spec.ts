import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { clinicalScenario } from "./clinical-helpers";
import { documentSql } from "./documents-helpers";
import {
  authorizePhotos,
  preparePhoto,
  syntheticPhoto,
} from "./photos-helpers";
import { intakeAdmin } from "./intake-helpers";
import { cleanupPrivacyExports } from "@/documents/privacy-cleanup";

test("complete client export contains pinned answers, signed evidence, original verified PDF, photo and lot label; retry is idempotent", async ({
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
  const bytes = await syntheticPhoto();
  const prepared = await preparePhoto(
    page,
    f.appointment.client_id,
    f.appointment.id,
    bytes,
  );
  expect(prepared.response.status()).toBe(201);
  const photo = await prepared.response.json();
  expect(
    (
      await f.owner.db.storage
        .from("glow-private")
        .upload(photo.upload_path, bytes, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  expect(
    (
      await page.request.post(`/api/files/${photo.id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/photos/${photo.photo_id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
  const body = { id: crypto.randomUUID(), client_id: f.appointment.client_id };
  const created = await page.request.post("/api/privacy/exports", {
    headers: origin,
    data: body,
  });
  expect(created.status(), await created.text()).toBe(201);
  const download = await page.request.get(`/api/privacy/exports/${body.id}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(download.headers()["content-type"]).toBe("application/zip");
  const zip = unzipSync(await download.body());
  const data = JSON.parse(strFromU8(zip["dati.json"]));
  expect(data.preparations[0].answers[f.anam.question]).toBe(
    "Nota sintetica riservata",
  );
  expect(data.consents[0].signed_payload).toBeTruthy();
  expect(data.photo_permissions).toHaveLength(2);
  expect(data.signature_requests).toHaveLength(1);
  expect(data.audit.length).toBeGreaterThan(0);
  expect(
    data.audit.every(
      (entry: { resource_type: string }) => entry.resource_type !== "pigments",
    ),
  ).toBe(true);
  expect(data.files).toHaveLength(3);
  for (const file of data.files) {
    expect(zip[file.name].length).toBe(file.size);
    expect(createHash("sha256").update(zip[file.name]).digest("hex")).toBe(
      file.sha256,
    );
  }
  expect(
    Buffer.from(zip[`consensi/${receipt.id}.pdf`]).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  expect(data).not.toHaveProperty("token");
  expect(strFromU8(zip["dati.json"])).not.toContain("token_hash");
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: body,
      })
    ).status(),
  ).toBe(201);
  await expect(
    (await page.request.get(`/api/privacy/exports/${body.id}`)).body(),
  ).resolves.toEqual(await download.body());
  const userStorage = await f.owner.db.storage
    .from("glow-exports")
    .download(
      `${(await f.owner.db.from("users").select("tenant_id").single()).data!.tenant_id}/${body.id}/archive.zip`,
    );
  expect(userStorage.error).not.toBeNull();
});

test("lost upload acknowledgment recovers the same deterministic archive without overwrite", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const client = await user.db
    .from("clients")
    .insert({
      tenant_id: (await user.db.from("users").select("tenant_id").single())
        .data!.tenant_id,
      first_name: "=1+1",
      last_name: "Synthetic",
      phone: "+393331234567",
    })
    .select()
    .single();
  expect(client.error).toBeNull();
  const id = crypto.randomUUID();
  const prepared = await user.db.rpc("prepare_privacy_export", {
    p_id: id,
    p_client_id: client.data!.id,
  });
  expect(prepared.error).toBeNull();
  // Place the first byte-identical archive by intercepting only finalization.
  documentSql(
    `update app_private.privacy_export_payloads set lease_until=clock_timestamp()-interval '1 second' where export_id='${id}';`,
  );
  const response = await page.request.post("/api/privacy/exports", {
    headers: origin,
    data: { id, client_id: client.data!.id },
  });
  expect(response.status(), await response.text()).toBe(201);
  const before = await page.request.get(`/api/privacy/exports/${id}`);
  const checksum = createHash("sha256")
    .update(await before.body())
    .digest("hex");
  documentSql(
    `update public.privacy_exports set state='failed',sha256=null,size_bytes=null where id='${id}';`,
  );
  const retried = await page.request.post("/api/privacy/exports", {
    headers: origin,
    data: { id, client_id: client.data!.id },
  });
  expect(retried.status(), await retried.text()).toBe(201);
  const after = await page.request.get(`/api/privacy/exports/${id}`);
  expect(
    createHash("sha256")
      .update(await after.body())
      .digest("hex"),
  ).toBe(checksum);
  const zip = unzipSync(await after.body());
  expect(strFromU8(zip["cliente.csv"])).toContain("'=1+1");
  expect(strFromU8(zip["cliente.csv"])).toContain("'+393331234567");
});

test("expired and revoked exports deny download; scheduled cleanup removes temporary copies while originals remain", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await user.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Cleanup",
        last_name: "Synthetic",
      })
      .select()
      .single()
  ).data!;
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  documentSql(
    `update public.privacy_exports set expires_at=clock_timestamp()-interval '1 second' where id='${id}';`,
  );
  expect((await page.request.get(`/api/privacy/exports/${id}`)).status()).toBe(
    410,
  );
  const result = await cleanupPrivacyExports(
    intakeAdmin,
    AbortSignal.timeout(10000),
    10,
  );
  expect(result.retry).toBe(0);
  expect(result.completed).toBeGreaterThan(0);
  expect(
    (
      await intakeAdmin.storage
        .from("glow-exports")
        .download(`${tenant}/${id}/archive.zip`)
    ).error,
  ).not.toBeNull();
  expect(
    (await user.db.from("clients").select("id").eq("id", client.id).single())
      .error,
  ).toBeNull();
  const second = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id: second, client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.delete(`/api/privacy/exports/${second}`, {
        headers: origin,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.get(`/api/privacy/exports/${second}`)).status(),
  ).toBe(410);
});

test("foreign tenant, operator and anonymous callers cannot use privacy APIs, RPCs or private export Storage", async ({
  page,
  browser,
}) => {
  const owner = await account();
  await login(page, owner);
  const tenant = (await owner.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await owner.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Private",
        last_name: "Synthetic",
      })
      .select()
      .single()
  ).data!;
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  const foreign = await account();
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, foreign);
  expect((await other.request.get(`/api/privacy/exports/${id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await other.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id: crypto.randomUUID(), client_id: client.id },
      })
    ).status(),
  ).toBe(404);
  expect((await foreign.db.from("privacy_exports").select("id")).data).toEqual(
    [],
  );
  const invited = await account(false);
  expect(
    (
      await intakeAdmin.from("users").insert({
        id: invited.id,
        tenant_id: tenant,
        display_name: "Clinical operator",
        role: "operator",
        clinical_access: true,
      })
    ).error,
  ).toBeNull();
  await login(other, invited);
  for (const path of ["/api/privacy", `/api/privacy/exports/${id}`])
    expect((await other.request.get(path)).status()).toBe(403);
  expect(
    (
      await invited.db.rpc("prepare_privacy_export", {
        p_id: crypto.randomUUID(),
        p_client_id: client.id,
      })
    ).error?.code,
  ).toBe("42501");
  await other.goto("/app/impostazioni");
  await expect(
    other.getByRole("button", { name: "Gestisci dati e privacy" }),
  ).toHaveCount(0);
  await context.clearCookies();
  expect((await other.request.get(`/api/privacy/exports/${id}`)).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        data: { id: crypto.randomUUID(), client_id: client.id },
      })
    ).status(),
  ).toBe(403);
  await context.close();
});

test("privacy settings and request flows work at phone, tablet and desktop widths; offline writes are disabled", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await user.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Elena W19",
        last_name: "Synthetic",
      })
      .select()
      .single()
  ).data!;
  await page.goto("/app/impostazioni");
  await page.getByRole("button", { name: "Gestisci dati e privacy" }).click();
  await page.getByLabel("Cerca per nome o cognome").fill("Elena W19");
  await page.getByLabel("Cliente per questa operazione").click();
  await page.getByRole("option", { name: /Elena W19 Synthetic/ }).click();
  await page
    .getByRole("button", { name: "Registra richiesta di cancellazione" })
    .click();
  await page
    .getByRole("button", { name: "Registra richiesta", exact: true })
    .click();
  await expect(page.getByText("Ricevuta", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Ho verificato l’identità della richiedente",
    })
    .check();
  await page
    .getByRole("button", { name: "Aggiorna richiesta", exact: true })
    .click();
  await expect(page.getByText("In verifica", { exact: true })).toBeVisible();
  for (const width of [375, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Salva regole e informativa" }),
    ).toBeEnabled();
  }
  await page
    .getByLabel("Contatto privacy dello studio")
    .fill("privacy@example.invalid");
  await page
    .getByLabel("Informativa dello studio")
    .fill(
      "Bozza sintetica per il collaudo. Non è un’informativa valida per dati reali.",
    );
  await page
    .getByRole("button", { name: "Salva regole e informativa" })
    .click();
  await expect(
    page.getByText("Regole di conservazione salvate.", { exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await expect(
    page.getByRole("button", { name: "Salva regole e informativa" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Prepara export cliente" }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await expect(
    page.getByRole("button", { name: "Salva regole e informativa" }),
  ).toBeEnabled();
  expect(
    (
      await user.db
        .from("clients")
        .select("archived_at")
        .eq("id", client.id)
        .single()
    ).data?.archived_at,
  ).toBeNull();
});

test("expired generation lease preserves one request and pending work remains unavailable until complete", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await user.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Lease",
        last_name: "Synthetic",
      })
      .select()
      .single()
  ).data!;
  const id = crypto.randomUUID();
  expect(
    (
      await user.db.rpc("prepare_privacy_export", {
        p_id: id,
        p_client_id: client.id,
      })
    ).error,
  ).toBeNull();
  expect((await page.request.get(`/api/privacy/exports/${id}`)).status()).toBe(
    422,
  );
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: client.id },
      })
    ).status(),
  ).toBe(409);
  documentSql(
    `update app_private.privacy_export_payloads set lease_until=clock_timestamp()-interval '1 second' where export_id='${id}';`,
  );
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  expect(
    (await user.db.from("privacy_exports").select("id")).data,
  ).toHaveLength(1);
});

test("only an explicitly reviewed notice is public; drafts and internal retention details remain private", async ({
  page,
  browser,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const context = await browser.newContext();
  const reader = await context.newPage();
  await reader.goto(`/informativa/${tenant}`);
  await expect(
    reader.getByText(/L’informativa per questo collegamento non è disponibile/),
  ).toBeVisible();
  const rules = {
    contacts: { months: 12, basis: "Motivo sintetico contatti per il test" },
    clinical: { months: 24, basis: "Motivo sintetico dossier per il test" },
    audit: { months: 12, basis: "Motivo sintetico audit per il test" },
  };
  const notice =
    "TESTO SINTETICO DI COLLAUDO. Non è una informativa valida. <script>alert(1)</script> Questo testo serve solo ai test locali.";
  const saved = await page.request.put("/api/privacy/settings", {
    headers: origin,
    data: {
      version: 0,
      rules,
      notice,
      contact_email: "privacy@example.invalid",
      reviewed: true,
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const response = await reader.goto(`/informativa/${tenant}`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(reader.getByText(notice, { exact: true })).toBeVisible();
  await expect(
    reader.getByRole("link", { name: "privacy@example.invalid" }),
  ).toBeVisible();
  expect(await reader.content()).not.toContain("Motivo sintetico dossier");
  expect((await reader.request.get("/api/privacy")).status()).toBe(401);
  const changed = await page.request.put("/api/privacy/settings", {
    headers: origin,
    data: {
      version: 1,
      rules,
      notice,
      contact_email: "privacy@example.invalid",
      reviewed: false,
    },
  });
  expect(changed.status()).toBe(200);
  await reader.reload();
  await expect(
    reader.getByText(/L’informativa per questo collegamento non è disponibile/),
  ).toBeVisible();
  const stale = await page.request.put("/api/privacy/settings", {
    headers: origin,
    data: {
      version: 1,
      rules,
      notice,
      contact_email: "privacy@example.invalid",
      reviewed: false,
    },
  });
  expect(stale.status()).toBe(409);
  await context.close();
});

test("request history paginates without silently hiding older requests", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const clients = await intakeAdmin
    .from("clients")
    .insert(
      Array.from({ length: 21 }, (_, i) => ({
        tenant_id: tenant,
        first_name: `Pagination ${i}`,
        last_name: "Synthetic",
      })),
    )
    .select();
  expect(clients.error).toBeNull();
  // Seed history only through the local SQL fixture boundary. The privileged
  // runtime role deliberately has no direct insert grant on this table.
  documentSql(
    `insert into public.privacy_requests(id,tenant_id,client_id,created_by) values ${clients.data!.map((client) => `('${crypto.randomUUID()}','${tenant}','${client.id}','${user.id}')`).join(",")};`,
  );
  const first = await (
    await page.request.get("/api/privacy?requestsPage=1")
  ).json();
  const second = await (
    await page.request.get("/api/privacy?requestsPage=2")
  ).json();
  expect(first.requests).toHaveLength(20);
  expect(first.moreRequests).toBe(true);
  expect(second.requests).toHaveLength(1);
  expect(second.moreRequests).toBe(false);
  expect(
    new Set(
      [...first.requests, ...second.requests].map(
        (row: { id: string }) => row.id,
      ),
    ).size,
  ).toBe(21);
});

test("a clinical revocation committed while a download waits for the tenant lock prevents release", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await user.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Revocation",
        last_name: "Synthetic",
      })
      .select()
      .single()
  ).data!;
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id, client_id: client.id },
      })
    ).status(),
  ).toBe(201);
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
      `begin;select id from public.tenants where id='${tenant}' for update;\n\\echo privacy-locked\n`,
    );
    await expect.poll(() => output.includes("privacy-locked")).toBe(true);
    const downloading = page.request.get(`/api/privacy/exports/${id}`);
    await expect
      .poll(() =>
        Number(
          documentSql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%access_privacy_export%';",
          ),
        ),
      )
      .toBeGreaterThan(0);
    lock.stdin.end(
      `update public.users set clinical_access=false where id='${user.id}';commit;\n`,
    );
    expect(await exited).toBe(0);
    expect((await downloading).status()).toBe(403);
  } finally {
    if (!lock.stdin.writableEnded) lock.stdin.end("rollback;\n");
    await exited;
  }
});
