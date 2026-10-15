/** Local application and labeled synthetic fixtures only. Never official Supabase. */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
Object.assign(process.env, localEnvironment());
const { chromium } = await import("@playwright/test");
const { clinicalScenario } = await import("../tests/e2e/clinical-helpers");
const { fillIntake } = await import("../tests/e2e/intake-helpers");
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
const dir = resolve(".impeccable/review/intake");
await mkdir(dir, { recursive: true });
let browser;
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch("http://localhost:3100/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  if (!process.argv.includes("--recovery-only")) {
    const studio = await browser.newContext({
      baseURL: "http://localhost:3100",
      viewport: { width: 1280, height: 1000 },
      locale: "it-IT",
    });
    const owner = await studio.newPage();
    const f = await clinicalScenario(owner, true);
    await owner.goto(`/app/appuntamenti/${f.appointment.id}/preparazione`);
    await owner
      .getByRole("button", { name: "Genera collegamento", exact: true })
      .click();
    const linkField = owner.getByRole("textbox", {
      name: "Collegamento personale",
      exact: true,
    });
    await linkField.waitFor();
    const link = await linkField.inputValue();
    const panel = owner.getByRole("region", {
      name: "La compilazione della cliente",
      exact: true,
    });
    await owner.evaluate(() => document.fonts.ready);
    await panel.screenshot({ path: `${dir}/professional-desktop.png` });
    await owner.setViewportSize({ width: 375, height: 812 });
    if (
      !(await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw new Error("Professional mobile overflow");
    await panel.screenshot({ path: `${dir}/professional-mobile.png` });
    const publicContext = await browser.newContext({
      baseURL: "http://localhost:3100",
      viewport: { width: 1280, height: 1000 },
      locale: "it-IT",
    });
    const client = await publicContext.newPage();
    await client.goto(link);
    await client
      .getByLabel("Annotazione dimostrativa (richiesta)", { exact: true })
      .waitFor();
    await client.evaluate(() => document.fonts.ready);
    await client.screenshot({ path: `${dir}/desktop.png`, fullPage: true });
    await client.setViewportSize({ width: 375, height: 812 });
    if (
      !(await client.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw new Error("Client mobile overflow");
    await client.screenshot({ path: `${dir}/mobile.png`, fullPage: true });
    await owner.setViewportSize({ width: 820, height: 1180 });
    await owner
      .getByRole("button", { name: "Modalità cliente su tablet", exact: true })
      .click();
    await owner.getByRole("alertdialog").waitFor();
    await owner.screenshot({
      path: `${dir}/tablet-confirm.png`,
      fullPage: false,
    });
    await owner
      .getByRole("button", {
        name: "Disconnetti e apri compilazione",
        exact: true,
      })
      .click();
    await owner
      .getByRole("heading", { name: "Prima del tuo appuntamento" })
      .waitFor();
    await owner.getByText("Modalità cliente", { exact: true }).waitFor();
    if ((await owner.request.get("/api/clients")).status() !== 401)
      throw new Error("Tablet professional session remains active");
    if (
      !(await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw new Error("Client tablet overflow");
    await owner.screenshot({ path: `${dir}/tablet.png`, fullPage: true });
    await fillIntake(client, "Risposta dimostrativa da inviare allo studio.");
    await client
      .getByRole("button", { name: "Invia compilazione", exact: true })
      .click();
    await client
      .getByRole("heading", { name: "Compilazione ricevuta" })
      .waitFor();
    await client.screenshot({
      path: `${dir}/success-mobile.png`,
      fullPage: true,
    });
    await client.goto(`/compila#${"f".repeat(64)}`);
    await client
      .getByRole("heading", { name: "Compilazione non disponibile" })
      .waitFor();
    await client.screenshot({
      path: `${dir}/unavailable-mobile.png`,
      fullPage: true,
    });
    await studio.close();
    await publicContext.close();
  }
  const recoveryContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 820, height: 1180 },
    locale: "it-IT",
  });
  const recovery = await recoveryContext.newPage();
  const retryFixture = await clinicalScenario(recovery, true);
  await recovery.goto(
    `/app/appuntamenti/${retryFixture.appointment.id}/preparazione`,
  );
  await recovery.route(
    `**/api/appointments/${retryFixture.appointment.id}/intake/tablet`,
    async (route) => {
      const response = await route.fetch();
      if (response.status() !== 201) throw new Error("Handoff fixture failed");
      await route.fulfill({ response, body: "{" });
    },
    { times: 1 },
  );
  await recovery
    .getByRole("button", { name: "Modalità cliente su tablet", exact: true })
    .click();
  await recovery
    .getByRole("button", {
      name: "Disconnetti e apri compilazione",
      exact: true,
    })
    .click();
  await recovery.waitForURL("**/accedi");
  await recovery
    .getByRole("button", { name: "Accedi al tuo studio", exact: true })
    .waitFor();
  if ((await recovery.request.get("/api/clients")).status() !== 401)
    throw new Error("Recovery retained professional session");
  await recovery.evaluate(() => document.fonts.ready);
  await recovery.screenshot({
    path: `${dir}/recovery-tablet.png`,
    fullPage: false,
  });
  await recoveryContext.close();
  console.log(
    process.argv.includes("--recovery-only")
      ? "Captured tablet recovery to login from local synthetic app."
      : "Captured nine intake views from local synthetic app.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
