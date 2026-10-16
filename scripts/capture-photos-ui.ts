/** Local synthetic fixtures only; no patient photographs or production writes. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localEnvironment } from "./local-env";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
Object.assign(process.env, localEnvironment());
const { chromium, expect } = await import("@playwright/test");
const { clinicalScenario } = await import("../tests/e2e/clinical-helpers");
const { issueSignature, fillSignature } =
  await import("../tests/e2e/documents-helpers");
const { syntheticPhoto, photos } = await import("../tests/e2e/photos-helpers");
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
const dir = resolve(".impeccable/review/photos");
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
  const studio = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 1000 },
    locale: "it-IT",
  });
  const owner = await studio.newPage();
  const f = await clinicalScenario(owner, true),
    id = f.appointment.client_id,
    route = `/app/clienti/${id}/foto?appuntamento=${f.appointment.id}`;
  await owner.goto(route);
  await expect(
    owner.getByRole("link", { name: "Apri preparazione e firma" }),
  ).toBeVisible();
  await owner.evaluate(() => document.fonts.ready);
  await owner.screenshot({
    path: `${dir}/missing-desktop.png`,
    fullPage: true,
  });
  const link = await issueSignature(owner, f.appointment.id);
  const publicContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 1100 },
    locale: "it-IT",
  });
  const client = await publicContext.newPage();
  await client.goto(`/firma#${link.token}`);
  const form = client.locator("form");
  await expect(
    client.getByRole("checkbox", { name: /Autorizzo le foto prima/ }),
  ).toBeVisible();
  await form.screenshot({ path: `${dir}/choices-desktop.png` });
  await client.setViewportSize({ width: 375, height: 1600 });
  await form.screenshot({ path: `${dir}/choices-mobile.png` });
  await client
    .getByRole("checkbox", { name: /Autorizzo le foto prima/ })
    .check();
  await fillSignature(client);
  await client
    .getByRole("button", { name: "Firma e conferma consenso", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Firma ricevuta" }),
  ).toBeVisible();
  await publicContext.close();
  await owner.reload();
  await expect(
    owner.getByRole("button", { name: "Scegli foto", exact: true }),
  ).toBeVisible();
  await owner.screenshot({ path: `${dir}/empty-desktop.png`, fullPage: true });
  await owner.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "synthetic-before.jpg",
    mimeType: "image/jpeg",
    buffer: await syntheticPhoto("#28664f", 6),
  });
  await expect(
    owner.getByRole("button", { name: "Salva foto", exact: true }),
  ).toBeVisible();
  await owner.setViewportSize({ width: 375, height: 1600 });
  await owner
    .getByRole("region", { name: "Aggiungi una foto" })
    .screenshot({ path: `${dir}/upload-mobile.png` });
  await owner.getByRole("button", { name: "Salva foto", exact: true }).click();
  await expect(
    owner.getByRole("button", { name: "Confronta come prima" }),
  ).toBeVisible();
  for (const [category, label, color] of [
    ["after", "Dopo", "#c5b9aa"],
    ["healed", "Guarito", "#91a9a0"],
  ]) {
    await owner.getByLabel("Momento del trattamento").click();
    await owner.getByRole("option", { name: label, exact: true }).click();
    await owner.getByLabel("Scegli foto dal dispositivo").setInputFiles({
      name: `synthetic-${category}.jpg`,
      mimeType: "image/jpeg",
      buffer: await syntheticPhoto(color),
    });
    await owner
      .getByRole("button", { name: "Salva foto", exact: true })
      .click();
    await expect(
      owner.getByRole("button", {
        name: `Confronta come ${category === "after" ? "dopo" : "guarito"}`,
      }),
    ).toBeVisible();
  }
  await expect(owner.locator("[data-sonner-toast]")).toHaveCount(0);
  const measurements = [];
  for (const [name, width, height] of [
    ["desktop", 1280, 1000],
    ["mobile", 375, 1100],
    ["tablet", 820, 1180],
  ] as const) {
    await owner.setViewportSize({ width, height });
    await owner.evaluate(() => window.scrollTo(0, 0));
    await owner.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    if (name !== "desktop")
      await owner.screenshot({ path: `${dir}/${name}-viewport.png` });
    measurements.push({
      name,
      ...(await owner.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll("button")]
          .filter(
            (el) =>
              el.textContent?.includes("Confronta") ||
              el.textContent?.includes("foto"),
          )
          .map((el) => ({
            text: el.textContent,
            height: el.getBoundingClientRect().height,
          })),
      }))),
    });
  }
  await owner.getByRole("button", { name: "Confronta come prima" }).click();
  await owner.getByRole("button", { name: "Confronta come guarito" }).click();
  const compare = owner.getByRole("region", { name: "Confronto della seduta" });
  for (const [name, width, height] of [
    ["desktop", 1280, 1000],
    ["mobile", 375, 1600],
    ["tablet", 820, 1180],
  ] as const) {
    await owner.setViewportSize({ width, height });
    while (
      await compare
        .getByRole("button", { name: "Mostra foto", exact: true })
        .count()
    )
      await compare
        .getByRole("button", { name: "Mostra foto", exact: true })
        .first()
        .click();
    await expect(compare.getByRole("img")).toHaveCount(2);
    await expect
      .poll(() =>
        compare
          .getByRole("img")
          .evaluateAll((images) =>
            images.every(
              (i) =>
                (i as HTMLImageElement).complete &&
                (i as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await compare.evaluate((el) =>
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100),
    );
    await owner.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await compare.screenshot({ path: `${dir}/comparison-${name}.png` });
  }
  await owner.setViewportSize({ width: 375, height: 1600 });
  await owner.getByLabel("Scegli foto dal dispositivo").setInputFiles({
    name: "photo.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("unsupported"),
  });
  await expect(owner.locator("p[role=alert]")).toBeVisible();
  await owner
    .getByRole("region", { name: "Aggiungi una foto" })
    .screenshot({ path: `${dir}/heic-mobile.png` });
  const permission = (
    await photos(owner, id, f.appointment.id)
  ).permissions.find((p: { purpose: string }) => p.purpose === "documentation");
  await owner.request.post(`/api/photo-permissions/${permission.id}/revoke`, {
    headers: origin,
    data: { version: permission.version },
  });
  await owner.reload();
  await expect(owner.getByText("Revocata", { exact: true })).toBeVisible();
  await owner.screenshot({ path: `${dir}/revoked-mobile.png`, fullPage: true });
  await writeFile(
    `${dir}/measurements.json`,
    JSON.stringify(measurements, null, 2),
  );
  console.log(JSON.stringify({ captures: 15, dir, measurements }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
