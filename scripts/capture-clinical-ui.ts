/** Real local application only; all visible people, texts and labels are synthetic. */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
Object.assign(process.env, localEnvironment());
const { chromium } = await import("@playwright/test");
const { clinicalScenario, model } =
  await import("../tests/e2e/clinical-helpers");
const { origin } = await import("../tests/e2e/helpers");
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
const dir = resolve(".impeccable/review/clinical");
await mkdir(dir, { recursive: true });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://localhost:3100/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    locale: "it-IT",
  });
  const page = await context.newPage();
  const f = await clinicalScenario(page, true);
  await model(page, "consent", "Consenso informativo di prova");
  const expired = await page.request.post("/api/clinical/lots", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      pigment_id: f.pigment.id,
      lot_number: "DEMO-SCADUTO",
      expires_on: "2025-12-31",
      label_file_id: f.label.id,
      label_text: "Etichetta sintetica di un lotto scaduto",
      active: true,
    },
  });
  if (!expired.ok()) throw new Error("Cannot prepare synthetic expired lot");
  await page.goto("/app/documenti");
  await page.getByRole("tab", { name: "Lotti", exact: true }).click();
  await page
    .getByRole("heading", { name: "Terra 04 · DEMO-01", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Catalog mobile overflow");
  await page.screenshot({ path: `${dir}/mobile.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Apri etichetta", exact: true })
    .first()
    .click();
  await page.getByAltText("Etichetta del lotto selezionato").waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector(
      'img[alt="Etichetta del lotto selezionato"]',
    ) as HTMLImageElement | null;
    return !!img?.complete && img.naturalWidth > 0;
  });
  await page.screenshot({ path: `${dir}/label-mobile.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Modifica lotto", exact: true })
    .first()
    .click();
  await page.getByLabel("Numero lotto", { exact: true }).waitFor();
  await page.screenshot({
    path: `${dir}/lot-editor-mobile.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.goto(`/app/documenti/modelli/${f.anam.revision.template_id}`);
  await page.getByLabel("Titolo del modello").waitFor();
  await page.screenshot({ path: `${dir}/template-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${dir}/template-desktop.png`,
    fullPage: true,
  });
  await page.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
  await page
    .getByLabel("Annotazione dimostrativa (richiesta alla firma)", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Leggi testo selezionato", exact: true })
    .click();
  await page.screenshot({
    path: `${dir}/preparation-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Preparation mobile overflow");
  await page.screenshot({
    path: `${dir}/preparation-mobile.png`,
    fullPage: true,
  });
  await context.close();
  console.log(
    "Captured clinical catalog, template, preparation, label and lot editor from local app.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
