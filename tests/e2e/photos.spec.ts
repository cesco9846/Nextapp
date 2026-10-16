import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { clinicalScenario, holdClinicalTenant } from "./clinical-helpers";
import {
  issueSignature,
  fillSignature,
  documentList,
  documentSql,
} from "./documents-helpers";
import {
  authorizePhotos,
  syntheticPhoto,
  preparePhoto,
  photos,
} from "./photos-helpers";

test("mobile acquisition compresses and orients a photo; separate signed choices and private comparison work", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true),
    id = f.appointment.client_id;
  const link = await issueSignature(page, f.appointment.id);
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const client = await context.newPage();
  await client.goto(`/firma#${link.token}`);
  const documentation = client.getByRole("checkbox", {
    name: /Autorizzo le foto prima/,
  });
  const demonstration = client.getByRole("checkbox", {
    name: /Autorizzo separatamente/,
  });
  await expect(documentation).not.toBeChecked();
  await expect(demonstration).not.toBeChecked();
  await expect(demonstration).toBeDisabled();
  await documentation.check();
  await expect(demonstration).toBeEnabled();
  await fillSignature(client);
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta" }),
  ).toBeVisible();
  await context.close();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/app/clienti/${id}/foto?appuntamento=${f.appointment.id}`);
  await expect(
    page.getByRole("button", { name: "Revoca documentazione", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Non autorizzata dalla cliente", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "iphone-synthetic.jpg",
    mimeType: "image/jpeg",
    buffer: await syntheticPhoto("#28664f", 6),
  });
  await expect(page.getByText(/1600 × 2400 px/)).toBeVisible();
  // Lose the completion response after the server has attached the image.
  let dropped = false;
  await page.route("**/api/photos/*/complete", async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Salva foto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Riprova salvataggio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Riprova salvataggio" }).click();
  await expect(
    page.getByRole("button", { name: "Confronta come prima" }),
  ).toBeVisible();
  let gallery = await photos(page, id, f.appointment.id);
  expect(gallery.photos).toHaveLength(1);
  const read = await page.request.post(
    `/api/photos/${gallery.photos[0].id}/read`,
    { headers: origin, data: {} },
  );
  expect(read.status()).toBe(200);
  expect(read.headers()["cache-control"]).toContain("no-store");
  expect(read.headers()["referrer-policy"]).toBe("no-referrer");
  const metadata = await sharp(await read.body()).metadata();
  expect(metadata.width).toBe(1600);
  expect(metadata.height).toBe(2400);
  expect(metadata.exif).toBeUndefined();
  expect(metadata.orientation).toBeUndefined();
  await page.getByLabel("Momento del trattamento").click();
  await page.getByRole("option", { name: "Dopo", exact: true }).click();
  await page.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "after-synthetic.jpg",
    mimeType: "image/jpeg",
    buffer: await syntheticPhoto("#c5b9aa"),
  });
  await page.getByRole("button", { name: "Salva foto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confronta come dopo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confronta come prima" }).click();
  await page.getByRole("button", { name: "Confronta come dopo" }).click();
  const comparison = page.getByRole("region", {
    name: "Confronto della seduta",
  });
  await comparison.getByRole("button", { name: "Mostra foto" }).first().click();
  await expect(
    comparison.getByRole("img", { name: "Confronto: Prima" }),
  ).toBeVisible();
  await comparison.getByRole("button", { name: "Mostra foto" }).click();
  await expect(
    comparison.getByRole("img", { name: "Confronto: Dopo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("blob:");
  gallery = await photos(page, id, f.appointment.id);
  expect(JSON.stringify(gallery)).not.toContain("object_path");
  expect(gallery.photos).toHaveLength(2);
  await expect
    .poll(
      async () =>
        (await documentList(page, f.appointment.id)).documents[0]
          ?.document_state,
      { timeout: 30000 },
    )
    .toBe("ready");
});

test("missing permission, HEIC and offline acquisition have usable recovery without an automatic queue", async ({
  page,
  context,
}) => {
  const f = await clinicalScenario(page, true),
    id = f.appointment.client_id,
    bytes = await syntheticPhoto();
  expect(
    (await preparePhoto(page, id, f.appointment.id, bytes)).response.status(),
  ).toBe(400);
  await page.goto(`/app/clienti/${id}/foto?appuntamento=${f.appointment.id}`);
  await expect(
    page.getByRole("link", { name: "Apri preparazione e firma" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scegli foto", exact: true }),
  ).toHaveCount(0);
  await authorizePhotos(page, f.appointment.id);
  await page.reload();
  await page.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "photo.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("unsupported"),
  });
  await expect(page.locator("p[role=alert]")).toContainText("Scegli JPEG");
  await page.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: bytes,
  });
  await expect(
    page.getByRole("button", { name: "Salva foto", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Salva foto", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Connessione assente",
  );
  await context.setOffline(false);
  expect((await photos(page, id, f.appointment.id)).photos).toHaveLength(0);
  await page.getByRole("button", { name: "Riprova salvataggio" }).click();
  await expect(
    page.getByRole("button", { name: "Confronta come prima" }),
  ).toBeVisible();
});

test("revocation during upload blocks attachment; existing photos remain private and archiving removes gallery access", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true),
    id = f.appointment.client_id;
  await authorizePhotos(page, f.appointment.id, {
    documentation: true,
    demonstration: true,
  });
  const bytes = await syntheticPhoto();
  const first = await preparePhoto(page, id, f.appointment.id, bytes);
  expect(first.response.status()).toBe(201);
  const prepared = await first.response.json();
  expect(
    (
      await f.owner.db.storage
        .from("glow-private")
        .upload(prepared.upload_path, bytes, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  const complete = () =>
    page.request.post(`/api/photos/${prepared.photo_id}/complete`, {
      headers: origin,
      data: {},
    });
  expect((await complete()).status()).toBe(200);
  const second = await preparePhoto(page, id, f.appointment.id, bytes, "after");
  const pending = await second.response.json();
  expect(
    (
      await f.owner.db.storage
        .from("glow-private")
        .upload(pending.upload_path, bytes, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  const permission = (
    await photos(page, id, f.appointment.id)
  ).permissions.find((p: { purpose: string }) => p.purpose === "documentation");
  expect(
    (
      await page.request.post(
        `/api/photo-permissions/${permission.id}/revoke`,
        { headers: origin, data: { version: permission.version } },
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/photos/${pending.photo_id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(400);
  expect(
    (await preparePhoto(page, id, f.appointment.id, bytes)).response.status(),
  ).toBe(400);
  const read = () =>
    page.request.post(`/api/photos/${prepared.photo_id}/read`, {
      headers: origin,
      data: {},
    });
  expect((await read()).status()).toBe(200);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, await account());
  expect(
    (
      await other.request.post(`/api/photos/${prepared.photo_id}/read`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect((await other.request.get(`/api/clients/${id}/photos`)).status()).toBe(
    404,
  );
  await otherContext.close();
  const photo = (await photos(page, id, f.appointment.id)).photos[0];
  expect(
    (
      await page.request.delete(`/api/photos/${photo.id}`, {
        headers: origin,
        data: { version: photo.version },
      })
    ).status(),
  ).toBe(200);
  expect((await read()).status()).toBe(404);
  expect((await photos(page, id, f.appointment.id)).photos).toHaveLength(0);
  expect(
    documentSql(
      `select count(*) from app_private.signed_payloads where consent_id in(select id from public.consents where appointment_id='${f.appointment.id}');`,
    ),
  ).toBe("1");
});

test("assignment revocation wins over a photo read waiting on the tenant lock", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page, true);
  await authorizePhotos(page, f.appointment.id);
  const content = await syntheticPhoto();
  const prepared = await preparePhoto(
    page,
    f.appointment.client_id,
    f.appointment.id,
    content,
  );
  const photo = await prepared.response.json();
  expect(
    (
      await f.owner.db.storage
        .from("glow-private")
        .upload(photo.upload_path, content, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  expect(
    (
      await page.request.post(`/api/photos/${photo.photo_id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
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
  expect(
    (
      await colleague.request.post(`/api/photos/${photo.photo_id}/read`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
  const tenant = (
    await staff.db.from("users").select("tenant_id").eq("id", staff.id).single()
  ).data!.tenant_id;
  const lock = await holdClinicalTenant(tenant);
  try {
    const pending = colleague.request.post(
      `/api/photos/${photo.photo_id}/read`,
      { headers: origin, data: {} },
    );
    await expect
      .poll(() =>
        Number(
          documentSql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%read_photo%'",
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
    const denied = await pending;
    expect(denied.status()).toBe(404);
    expect(denied.headers()["content-type"]).toContain("application/json");
    expect(
      (
        await colleague.request.get(
          `/api/clients/${f.appointment.client_id}/photos`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    lock.close();
    await colleagueContext.close();
  }
});
