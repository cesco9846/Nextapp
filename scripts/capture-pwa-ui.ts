/** Local synthetic screenshots only; no official accounts or clinical data. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";

Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
const { account, login } = await import("../tests/e2e/helpers");
const { chromium, webkit, devices, expect } = await import("@playwright/test");
const { cloudWebkitOptions } = await import("./webkit-cloud");
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
const output = resolve(".impeccable/review/pwa");
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
  if (!ready) throw new Error("Local application unavailable");
  const user = await account();
  for (const kind of ["desktop", "iphone", "ipad", "android"] as const) {
    const ios = kind === "iphone" || kind === "ipad";
    const browser = await (ios ? webkit : chromium).launch(
      ios && process.env.GLOW_CLOUD_WEBKIT === "1" ? cloudWebkitOptions() : {},
    );
    try {
      const device =
        kind === "iphone"
          ? devices["iPhone 13"]
          : kind === "ipad"
            ? devices["iPad Pro 11"]
            : kind === "android"
              ? devices["Pixel 7"]
              : { viewport: { width: 1280, height: 900 } };
      const context = await browser.newContext({
        ...device,
        deviceScaleFactor: 1,
        baseURL: "http://localhost:3100",
        locale: "it-IT",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await login(page, user);
      async function capture(name: string) {
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        const file = `${output}/${kind}-${name}.png`;
        await page.screenshot({
          path: file,
          fullPage: true,
          animations: "disabled",
        });
        captures.push({
          kind,
          name,
          file,
          viewport: page.viewportSize(),
          engine: await browser.version(),
          metrics: await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            inputs: [...document.querySelectorAll("input")].map((e) => ({
              font: getComputedStyle(e).fontSize,
              height: e.getBoundingClientRect().height,
            })),
            dialog: document
              .querySelector('[role="dialog"]')
              ?.getBoundingClientRect()
              .toJSON(),
          })),
        });
      }
      if (kind !== "android") {
        await page.goto("/app/impostazioni");
        await expect(
          page.getByRole("heading", { name: "Glow sul tuo dispositivo" }),
        ).toBeVisible();
        await capture("install");
      }
      await page.goto("/app/clienti");
      await page
        .getByRole("button", { name: "Nuova cliente", exact: true })
        .click();
      await page.getByLabel("Nome", { exact: true }).fill("Elena di prova");
      await page.getByLabel("Cognome", { exact: true }).fill("Rossi");
      if (kind !== "android") await capture("form-portrait");
      if (kind !== "desktop") {
        const size = page.viewportSize()!;
        await page.setViewportSize({ width: size.height, height: size.width });
        await page
          .getByRole("button", { name: "Salva cliente", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Salva cliente", exact: true }),
        ).toBeInViewport();
        await capture("form-landscape-scroll-end");
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  await writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
  console.log(
    JSON.stringify({
      captures: captures.length,
      path: output,
      physicalDeviceEvidence: false,
    }),
  );
} finally {
  server.kill("SIGTERM");
}
