/** Captures use only local Supabase and explicitly synthetic clinical fixtures. */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { localEnvironment } from "./local-env";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
Object.assign(process.env, localEnvironment());
const { chromium, expect } = await import("@playwright/test");
const { clinicalScenario } = await import("../tests/e2e/clinical-helpers");
const { fillSignature, documentList, documentSql } =
  await import("../tests/e2e/documents-helpers");
const { login, origin } = await import("../tests/e2e/helpers");
const server = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3100",
  ],
  { env: { ...process.env, NEXT_DIST_DIR: ".next-e2e" }, stdio: "ignore" },
);
const dir = resolve(".impeccable/review/signature");
await mkdir(dir, { recursive: true });
let browser;
let injected = false;
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch("http://localhost:3100/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const studio = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 1000 },
    locale: "it-IT",
  });
  const owner = await studio.newPage();
  const f = await clinicalScenario(owner, true);
  await owner.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await owner
    .getByRole("button", { name: "Genera link di firma", exact: true })
    .click();
  const field = owner.getByRole("textbox", {
    name: "Collegamento per la firma",
    exact: true,
  });
  await expect(field).toHaveValue(/\/firma#/);
  const link = await field.inputValue();
  const panel = owner.getByRole("region", {
    name: "Firma e documenti",
    exact: true,
  });
  await owner.evaluate(() => document.fonts.ready);
  await panel.screenshot({ path: `${dir}/professional-desktop.png` });
  await owner.setViewportSize({ width: 375, height: 1600 });
  await panel.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90),
  );
  await panel.screenshot({ path: `${dir}/professional-mobile.png` });
  const customer = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 1000 },
    locale: "it-IT",
  });
  const client = await customer.newPage();
  await client.goto(link);
  await expect(
    client.getByRole("heading", { name: "Il tuo consenso al trattamento" }),
  ).toBeVisible();
  await client.evaluate(() => document.fonts.ready);
  await client.screenshot({ path: `${dir}/desktop.png`, fullPage: true });
  await client.setViewportSize({ width: 375, height: 812 });
  await client.screenshot({ path: `${dir}/mobile.png`, fullPage: true });
  await fillSignature(client);
  await client
    .locator("form")
    .screenshot({ path: `${dir}/signature-mobile.png` });
  await owner.setViewportSize({ width: 820, height: 1180 });
  await owner
    .getByRole("button", { name: "Firma su tablet", exact: true })
    .click();
  await expect(owner.getByRole("alertdialog")).toBeVisible();
  await owner.screenshot({ path: `${dir}/tablet-confirm.png` });
  await owner
    .getByRole("button", { name: "Disconnetti e apri firma", exact: true })
    .click();
  await expect(
    owner.getByText("Modalità cliente", { exact: true }),
  ).toBeVisible();
  await owner.screenshot({ path: `${dir}/tablet.png`, fullPage: true });
  documentSql(
    `create function public.capture_fail_document() returns trigger language plpgsql as $$ begin if new.appointment_id='${f.appointment.id}' and new.document_state='ready' then raise exception 'SYNTHETIC_CAPTURE_FAILURE'; end if;return new;end;$$;create trigger capture_fail_document before update on public.consents for each row execute function public.capture_fail_document();`,
  );
  injected = true;
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta", exact: true }),
  ).toBeVisible();
  await client.screenshot({
    path: `${dir}/success-mobile.png`,
    fullPage: true,
  });
  await login(owner, f.owner);
  await owner.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await expect
    .poll(
      async () =>
        (await documentList(owner, f.appointment.id)).documents[0]
          ?.document_state,
      { timeout: 30000 },
    )
    .toBe("failed");
  await expect(
    panel.getByText("PDF da rigenerare", { exact: true }),
  ).toBeVisible();
  await owner.setViewportSize({ width: 1280, height: 1000 });
  await panel.screenshot({ path: `${dir}/failed-desktop.png` });
  await owner.setViewportSize({ width: 375, height: 1600 });
  await panel.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90),
  );
  await panel.screenshot({ path: `${dir}/failed-mobile.png` });
  documentSql(
    "drop trigger capture_fail_document on public.consents;drop function public.capture_fail_document();",
  );
  injected = false;
  await panel
    .getByRole("button", { name: "Riprova generazione PDF", exact: true })
    .click();
  await expect(panel.getByText("PDF pronto", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await panel.screenshot({ path: `${dir}/ready-mobile.png` });
  const doc = (await documentList(owner, f.appointment.id)).documents[0];
  const response = await owner.request.post(
    `/api/consents/${doc.id}/download`,
    { headers: origin, data: {} },
  );
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  await writeFile(`${dir}/document.pdf`, bytes);
  const pdf = await PDFDocument.load(bytes);
  for (const [name, page] of [
    ["pdf-first", 1],
    ["pdf-signature", pdf.getPageCount()],
  ] as const)
    execFileSync("pdftoppm", [
      "-f",
      String(page),
      "-singlefile",
      "-scale-to",
      "1200",
      "-png",
      `${dir}/document.pdf`,
      `${dir}/${name}`,
    ]);
  await client.goto(`/firma#${"f".repeat(64)}`);
  await expect(
    client.getByRole("heading", { name: "Firma non disponibile" }),
  ).toBeVisible();
  await client.screenshot({
    path: `${dir}/unavailable-mobile.png`,
    fullPage: true,
  });
  for (const p of [client, owner])
    if (
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    )
      throw new Error("Horizontal overflow");
  console.log("Signature captures complete; synthetic local content only.");
} finally {
  if (injected)
    documentSql(
      "drop trigger capture_fail_document on public.consents;drop function public.capture_fail_document();",
    );
  await browser?.close();
  server.kill("SIGTERM");
}
