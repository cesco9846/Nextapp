/** Local synthetic fixtures only. Never run against the official project. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
const { chromium, expect } = await import("@playwright/test");
const { packageFixture, issuePacket, packetCall, answersFor, signPacket } =
  await import("../tests/e2e/packages-helpers");
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
const browser = await chromium.launch();
const output = resolve(".impeccable/review/packages");
await mkdir(output, { recursive: true });
const captures: object[] = [];
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch("http://localhost:3100/api/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Local application unavailable");
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    locale: "it-IT",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const f = await packageFixture(page, true, true);
  async function capture(target: typeof page, name: string) {
    for (const width of [375, 820, 1280]) {
      await target.setViewportSize({ width, height: 900 });
      await target.evaluate(() => document.fonts.ready);
      await target.evaluate(() => scrollTo(0, 0));
      const file = `${output}/${name}-${width}.png`;
      await target.screenshot({
        path: file,
        fullPage: true,
        animations: "disabled",
      });
      const metrics = await target.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        height: document.documentElement.scrollHeight,
      }));
      captures.push({ name, width, file, metrics });
      if (metrics.overflow) throw Error(`Horizontal overflow ${name} ${width}`);
    }
  }
  await page.goto("/app/documenti/predefiniti");
  await expect(
    page.getByRole("heading", { name: "Moduli predefiniti", exact: true }),
  ).toBeVisible();
  await capture(page, "library");
  await page
    .getByRole("button", { name: "Modifica bozza", exact: true })
    .click();
  await expect(
    page.getByLabel("Informativa privacy dello studio"),
  ).toBeVisible();
  await capture(page, "editor");
  await page.goto(`/app/appuntamenti/${f.appt.id}/preparazione`);
  await page
    .getByRole("button", {
      name: "Usa un modulo predefinito per questa seduta",
    })
    .click();
  await page
    .getByLabel("Data di nascita della cliente", { exact: true })
    .fill("2010-01-01");
  await page
    .getByLabel("Luogo di nascita", { exact: true })
    .fill("Luogo sintetico");
  await page
    .getByRole("button", { name: "Aggiungi rappresentante", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aggiungi rappresentante", exact: true })
    .click();
  await page
    .getByLabel("Nome e cognome · rappresentante 1", { exact: true })
    .fill("Genitore sintetico primo rappresentante");
  await page
    .getByLabel("Nome e cognome · rappresentante 2", { exact: true })
    .fill("Genitore sintetico secondo rappresentante");
  await capture(page, "representatives");
  const issued = await issuePacket(page, f);
  const [one, two] = issued.links.map((l) => l.token);
  const publicContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    locale: "it-IT",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const client = await publicContext.newPage();
  await client.goto("about:blank");
  await client.goto(`/documento#${one}`);
  await expect(
    client.getByRole("heading", {
      name: "Privacy e dati relativi alla salute",
    }),
  ).toBeVisible();
  await capture(client, "health");
  await packetCall(page.request, one, "health", { allowed: true });
  await packetCall(page.request, two, "health", { allowed: true });
  await client.goto("about:blank");
  await client.goto(`/documento#${one}`);
  await expect(
    client.getByRole("heading", { name: "Dichiarazioni pre-trattamento" }),
  ).toBeVisible();
  await capture(client, "questionnaire");
  const c = await packetCall(page.request, one, "answers", {
    answers: answersFor(f.content),
  });
  await client.goto("about:blank");
  await client.goto(`/documento#${one}`);
  await expect(
    client.getByRole("heading", { name: "Le risposte da verificare" }),
  ).toBeVisible();
  await capture(client, "sign");
  for (const width of [375, 820, 1280]) {
    await client.setViewportSize({ width, height: 900 });
    await client
      .getByRole("heading", { name: "Firma di Genitore sintetico 1" })
      .scrollIntoViewIfNeeded();
    const file = `${output}/sign-confirmation-${width}.png`;
    await client.screenshot({ path: file, animations: "disabled" });
    captures.push({
      name: "sign-confirmation",
      width,
      file,
      supplementalViewportCrop: true,
    });
  }
  await packetCall(page.request, one, "sign", signPacket(c, "recognizable"));
  const c2 = await packetCall(page.request, two, "read");
  await packetCall(page.request, two, "sign", signPacket(c2, "detail"));
  await page.goto(`/app/appuntamenti/${f.appt.id}/preparazione`);
  await page
    .getByRole("button", { name: "Verifica risposte e controfirma" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verifica e controfirma", exact: true }),
  ).toBeVisible();
  await capture(page, "counter");
  for (const width of [375, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", { name: "Controfirma e genera PDF" })
      .scrollIntoViewIfNeeded();
    const file = `${output}/counter-confirmation-${width}.png`;
    await page.screenshot({ path: file, animations: "disabled" });
    captures.push({
      name: "counter-confirmation",
      width,
      file,
      supplementalViewportCrop: true,
    });
  }
  await writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
  console.log(
    JSON.stringify({
      captures: captures.length,
      path: output,
      syntheticLocalOnly: true,
    }),
  );
  await publicContext.close();
  await context.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
