/** Reproducible local synthetic evidence; never uses the official database. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";

Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
const { account, login, origin } = await import("../tests/e2e/helpers");
const { chromium, expect } = await import("@playwright/test");
const server = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3100",
  ],
  {
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      NODE_USE_ENV_PROXY: "1",
    },
    stdio: "ignore",
  },
);
const output = resolve(".impeccable/review/privacy");
await mkdir(output, { recursive: true });
const captures: object[] = [];
const browser = await chromium.launch();
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch("http://localhost:3100/api/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Local app unavailable");
  const user = await account();
  const tenant = (await user.db.from("users").select("tenant_id").single())
    .data!.tenant_id;
  const client = (
    await user.db
      .from("clients")
      .insert({
        tenant_id: tenant,
        first_name: "Elena — prova sintetica",
        last_name: "W19",
      })
      .select()
      .single()
  ).data!;
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    locale: "it-IT",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await login(page, user);
  async function capture(name: string, width: number) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => scrollTo(0, 0));
    const file = `${output}/${name}-${width}.png`;
    await page.screenshot({
      path: file,
      fullPage: true,
      animations: "disabled",
    });
    captures.push({
      name,
      width,
      file,
      engine: await browser.version(),
      metrics: await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        inputs: [...document.querySelectorAll("input,textarea")].map((e) => ({
          font: getComputedStyle(e).fontSize,
          height: e.getBoundingClientRect().height,
        })),
      })),
    });
  }
  await page.goto("/app/impostazioni");
  await page.getByRole("button", { name: "Gestisci dati e privacy" }).click();
  await expect(
    page.getByRole("button", { name: "Salva regole e informativa" }),
  ).toBeVisible();
  for (const width of [375, 820, 1280]) await capture("empty", width);
  expect(
    (
      await page.request.post("/api/privacy/requests", {
        headers: origin,
        data: { id: crypto.randomUUID(), client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post("/api/privacy/exports", {
        headers: origin,
        data: { id: crypto.randomUUID(), client_id: client.id },
      })
    ).status(),
  ).toBe(201);
  const rules = {
    contacts: {
      months: 12,
      basis: "Esempio sintetico, da sostituire con regole approvate.",
    },
    clinical: {
      months: 24,
      basis: "Esempio sintetico per il collaudo, non è un termine legale.",
    },
    audit: { months: 12, basis: "Esempio sintetico per le tracce di accesso." },
  };
  expect(
    (
      await page.request.put("/api/privacy/settings", {
        headers: origin,
        data: {
          version: 0,
          rules,
          notice:
            "Informativa sintetica usata solo per il collaudo locale di Glow. Non è un testo approvato per il trattamento di dati reali.\n\nLo studio fornirà finalità, basi, conservazione, diritti e contatti applicabili prima del pilota.",
          contact_email: "privacy@example.invalid",
          reviewed: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Aggiorna stato privacy" }).click();
  await expect(page.getByText("Pronto", { exact: true })).toBeVisible();
  for (const width of [375, 820, 1280]) await capture("history", width);
  await page.goto(`/informativa/${tenant}`);
  await expect(
    page.getByRole("link", { name: "privacy@example.invalid" }),
  ).toBeVisible();
  for (const width of [375, 820, 1280]) await capture("notice", width);
  await context.close();
  await writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
  console.log(
    JSON.stringify({
      captures: captures.length,
      path: output,
      physicalDeviceEvidence: false,
    }),
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
