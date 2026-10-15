/** Real local app, synthetic local identities. Never use production fixtures. */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
Object.assign(process.env, localEnvironment());
const { chromium } = await import("@playwright/test");
const { account, login, origin } = await import("../tests/e2e/helpers");
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
const directory = resolve(".impeccable/review/team");
await mkdir(directory, { recursive: true });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch("http://localhost:3100/api/health")).ok;
    } catch {
      /* startup */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Local server did not start");
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1600, height: 1000 },
    locale: "it-IT",
  });
  const page = await context.newPage();
  await login(page, await account());
  for (const [display_name, clinical_access] of [
    ["Claudia Neri", true],
    ["Giada Ferri", false],
  ] as const) {
    const colleague = await account(false);
    const response = await page.request.post("/api/team/invitations", {
      headers: origin,
      data: { email: colleague.email, clinical_access },
    });
    const invitation = await response.json();
    if (!response.ok()) throw new Error("Cannot create capture invitation");
    const result = await colleague.db.rpc("accept_team_invitation", {
      p_token: invitation.token,
      p_display_name: display_name,
    });
    if (result.error) throw new Error("Cannot accept capture invitation");
  }
  await page.request.post("/api/team/invitations", {
    headers: origin,
    data: {
      email: "nuova.collaboratrice@example.invalid",
      clinical_access: false,
    },
  });
  await page.goto("/app/team");
  await page
    .getByRole("heading", { name: "Claudia Neri", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Team overflows the mobile viewport");
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  await page.goto("/app/impostazioni");
  await page
    .getByRole("heading", { name: "Glow sul tuo dispositivo", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${directory}/installation.png`,
    fullPage: true,
  });
  const inviteContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "it-IT",
  });
  const invitePage = await inviteContext.newPage();
  await invitePage.goto(`http://localhost:3100/invito#${"a".repeat(64)}`);
  await invitePage.getByLabel("Email professionale").waitFor();
  await invitePage.screenshot({
    path: `${directory}/invitation.png`,
    fullPage: true,
  });
  await inviteContext.close();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/app/team");
  await page
    .getByRole("heading", { name: "Claudia Neri", exact: true })
    .waitFor();
  await context.setOffline(true);
  await page
    .getByRole("alert")
    .filter({ hasText: "Glow richiede Internet" })
    .waitFor();
  await page.screenshot({
    path: `${directory}/connection.png`,
    fullPage: true,
  });
  await context.close();
  console.log(
    "Captured team desktop/mobile, installation, invitation and connection states from the local app.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
