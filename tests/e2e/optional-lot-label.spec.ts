import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { clinicalScenario } from "./clinical-helpers";
import { origin } from "./helpers";
import {
  issueSignature,
  fillSignature,
  documentList,
} from "./documents-helpers";

async function capture(page: Page, state: string, widths = [375, 820, 1280]) {
  const directory = process.env.GLOW_LOT_CAPTURE_DIR;
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

test("a lot without a photo can be created, edited, selected, signed and included in a private PDF", async ({
  page,
  browser,
}) => {
  const f = await clinicalScenario(page);
  await page.goto("/app/documenti");
  await page.getByRole("tab", { name: "Pigmenti", exact: true }).click();
  await page
    .getByRole("button", { name: "Aggiungi lotto", exact: true })
    .click();
  await page.getByLabel("Numero lotto", { exact: true }).fill("NO-PHOTO-UI");
  await page.getByLabel("Scadenza", { exact: true }).fill("2035-12-31");
  await expect(
    page.getByLabel("Foto dell’etichetta (facoltativa)", { exact: true }),
  ).not.toHaveAttribute("required");
  await capture(page, "new-lot");
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/clinical/lots") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Salva lotto", exact: true }).click();
  const result = await savedResponse;
  expect(result.status()).toBe(201);
  const lot = await result.json();
  expect(lot.label_file_id).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const edit = await page.request.post("/api/clinical/lots", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: lot.id,
      version: lot.version,
      pigment_id: f.pigment.id,
      lot_number: lot.lot_number,
      expires_on: lot.expires_on,
      label_text: "Testo disponibile anche senza immagine",
      active: true,
    },
  });
  expect(edit.status()).toBe(200);
  expect((await edit.json()).label_file_id).toBeNull();
  const preparation = { ...f.preparationBody, lot_ids: [lot.id] };
  expect(
    (
      await page.request.post(
        `/api/appointments/${f.appointment.id}/preparation`,
        { headers: origin, data: preparation },
      )
    ).status(),
  ).toBe(200);
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await expect(
    page
      .getByText("Foto dell’etichetta non allegata.", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(page, "preparation", [375]);
  // A later catalog attachment must not silently change the chosen historical snapshot.
  expect(
    (
      await page.request.post("/api/clinical/lots", {
        headers: origin,
        data: {
          request_id: crypto.randomUUID(),
          id: lot.id,
          version: 2,
          pigment_id: f.pigment.id,
          lot_number: lot.lot_number,
          expires_on: lot.expires_on,
          label_text: "Foto aggiunta successivamente",
          label_file_id: f.label.id,
          active: true,
        },
      })
    ).status(),
  ).toBe(200);
  const signature = await issueSignature(page, f.appointment.id);
  const context = await browser.newContext();
  const client = await context.newPage();
  await client.goto(`/firma#${signature.token}`);
  await expect(
    client.getByText("Foto dell’etichetta non allegata.", { exact: true }),
  ).toBeVisible();
  await expect(
    client.getByRole("button", { name: "Visualizza etichetta", exact: true }),
  ).toHaveCount(0);
  await capture(client, "signature");
  await fillSignature(client);
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
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
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: await pdf.body(),
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  expect(text).toContain("NO-PHOTO-UI");
  expect(text).toContain("Foto dell’etichetta non allegata.");
  expect(text).toContain("Testo disponibile anche senza immagine");
  expect(text).not.toContain("Foto aggiunta successivamente");
  await context.close();
});
