/** Synthetic local state only. No official fixture or deletion. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
const { account, login, origin } = await import("../tests/e2e/helpers");
const { appointment } = await import("../tests/e2e/clinical-helpers");
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
const output = resolve(".impeccable/review/management");
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
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    locale: "it-IT",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await login(page, user);
  await appointment(page, user);
  expect(
    (
      await page.request.post("/api/clients", {
        headers: origin,
        data: {
          first_name: "Cliente senza storico",
          last_name: "Prova sintetica",
          email: "",
          phone: "",
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post("/api/services", {
        headers: origin,
        data: {
          name: "Servizio senza storico sintetico",
          duration_minutes: 30,
          price_cents: 3000,
          color: "#28664f",
        },
      })
    ).status(),
  ).toBe(201);
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
      metrics: await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        dialogs: [
          ...document.querySelectorAll('[role="dialog"],[role="alertdialog"]'),
        ].map((e) => e.getBoundingClientRect().toJSON()),
      })),
    });
  }
  for (const scenario of [
    "rename",
    "client-allowed",
    "client-blocked",
    "service-allowed",
    "service-blocked",
  ]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    if (scenario === "rename") {
      await page.goto("/app/impostazioni");
      await page.getByRole("button", { name: "Modifica nome studio" }).click();
      await page
        .getByLabel("Nome dello studio", { exact: true })
        .fill("Studio Aurora — prova sintetica");
    } else if (scenario.startsWith("client")) {
      await page.goto("/app/clienti");
      await page
        .getByRole("button", {
          name:
            scenario === "client-allowed"
              ? /Apri scheda di Cliente senza storico/
              : /Apri scheda di Elena Di prova/,
        })
        .click();
      await page
        .getByRole("button", { name: "Elimina cliente", exact: true })
        .click();
    } else {
      await page.goto("/app/catalogo");
      await page
        .getByRole("button", {
          name:
            scenario === "service-allowed"
              ? "Modifica Servizio senza storico sintetico"
              : "Modifica Consulenza iniziale",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Elimina servizio", exact: true })
        .click();
    }
    if (scenario.endsWith("blocked"))
      await expect(
        page.getByRole("alertdialog").getByText("Eliminazione bloccata"),
      ).toBeVisible();
    else if (scenario !== "rename")
      await expect(
        page.getByRole("button", {
          name: scenario.startsWith("client")
            ? "Elimina cliente definitivamente"
            : "Elimina servizio definitivamente",
        }),
      ).toBeVisible();
    for (const width of [375, 820, 1280]) await capture(scenario, width);
  }
  await context.close();
  await writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
  console.log(
    JSON.stringify({
      captures: captures.length,
      path: output,
      syntheticLocalOnly: true,
    }),
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
