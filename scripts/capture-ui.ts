/** Capture the real local app with synthetic local data; never connects to production. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Temporal } from "temporal-polyfill";
import { localEnvironment } from "./local-env";

Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
const { account, login, origin } = await import("../tests/e2e/helpers");
const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-e2e",
  NODE_USE_ENV_PROXY: "1",
};
const server = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3100",
  ],
  { env, stdio: "ignore" },
);
const directory = resolve(".impeccable/review");
await mkdir(directory, { recursive: true });
const { chromium } = await import("@playwright/test");
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch("http://localhost:3100/api/health")).ok;
    } catch {
      /* service is starting */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!ready) throw new Error("Local application did not start");
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    locale: "it-IT",
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  const user = await account();
  await login(page, user);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const day = Temporal.Now.zonedDateTimeISO("Europe/Rome")
    .toPlainDate()
    .toString();
  for (const [index, first_name, last_name] of [
    [0, "Elena", "Rossi"],
    [1, "Sofia", "Moretti"],
    [2, "Chiara", "Conti"],
  ] as const) {
    const result = await page.request.post("/api/clients", {
      headers: origin,
      data: { first_name, last_name, phone: "3331234567", email: "" },
    });
    const client = await result.json();
    const start = Temporal.PlainDateTime.from(`${day}T${10 + index * 2}:00`)
      .toZonedDateTime("Europe/Rome")
      .toInstant();
    const booked = await page.request.post("/api/appointments", {
      headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
      data: {
        client_id: client.id,
        service_id: workspace.services[0].id,
        location_id: workspace.locations[0].id,
        operator_id: user.id,
        starts_at: start.toString(),
        ends_at: start.add({ hours: 1 }).toString(),
        price_cents: 5000,
      },
    });
    if (!booked.ok()) throw new Error("Cannot create local capture fixture");
  }
  await page.reload();
  const calendar = page.getByRole("region", {
    name: "Calendario appuntamenti",
  });
  await calendar.getByRole("button", { name: /Elena Rossi/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/desktop.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Nuovo appuntamento", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  const close = await page
    .getByRole("button", { name: "Chiudi", exact: true })
    .boundingBox();
  await page.screenshot({
    path: `${directory}/appointment-form.png`,
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "Servizio", exact: true }).click();
  const option = await page
    .getByRole("option", { name: "Consulenza iniziale", exact: true })
    .boundingBox();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: "Elena Rossi", exact: true })
    .waitFor();
  const tab = await page
    .getByRole("tab", { name: "Attive", exact: true })
    .boundingBox();
  const contact = await page
    .getByRole("link", { name: "+393331234567", exact: true })
    .first()
    .boundingBox();
  const targets = { close, option, tab, contact };
  for (const [name, box] of Object.entries(targets)) {
    if (!box || box.height < 44 || box.width < 44)
      throw new Error(`${name} touch target below 44px`);
  }
  await writeFile(
    `${directory}/touch-targets.json`,
    JSON.stringify(targets, null, 2),
  );
  await page.screenshot({ path: `${directory}/clients.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/agenda");
  await calendar.getByRole("button", { name: /Elena Rossi/ }).waitFor();
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  await context.close();
  console.log(
    "Captured desktop agenda, mobile agenda, appointment form and clients with local fixtures.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
