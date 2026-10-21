import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";

async function createClient(page: Page, name: string) {
  const r = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: name, last_name: "W18", phone: "", email: "" },
  });
  expect(r.status()).toBe(201);
}
async function visibility(page: Page, value: "visible" | "hidden") {
  // Emulate the lifecycle event consumed by React Query. This is not evidence
  // of a physical phone's OS suspension, software keyboard or Home installation.
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  }, value);
}

test("PWA launch requires authentication and offers real manifest assets and manual installation", async ({
  page,
  request,
  browserName,
}) => {
  await page.goto("/app/agenda");
  await expect(page).toHaveURL(/\/accedi/);
  await login(page, await account());
  await page.goto("/app/impostazioni");
  await expect(
    page.getByRole("heading", { name: "Glow sul tuo dispositivo" }),
  ).toBeVisible();
  await expect(page.getByText(/apri Glow in Safari/)).toBeVisible();
  if (browserName === "webkit")
    await expect(
      page.getByRole("button", { name: "Installa Glow", exact: true }),
    ).toHaveCount(0);
  expect(
    await page
      .locator('meta[name="mobile-web-app-capable"]')
      .getAttribute("content"),
  ).toBe("yes");
  const url = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(url!)).json();
  expect(manifest).toMatchObject({
    name: "Glow",
    id: "/",
    scope: "/",
    start_url: "/app/agenda",
    display: "standalone",
    lang: "it",
  });
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\//);
    expect((await image.body()).length).toBeGreaterThan(100);
  }
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect((await request.get(apple!)).status()).toBe(200);
});

test("reconnect refreshes even fresh data, preserves a draft and never replays its offline save", async ({
  page,
  context,
}) => {
  await login(page, await account());
  await page.goto("/app/clienti");
  await expect(
    page.getByRole("button", { name: "Nuova cliente", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nuova cliente", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Bozza in memoria");
  await page.getByLabel("Cognome", { exact: true }).fill("W18");
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/clients")
      writes++;
  });
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Salva cliente", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /richiesta non è stata inviata/ }),
  ).toBeVisible();
  const remote = `Riconnessa-${crypto.randomUUID().slice(0, 8)}`;
  // APIRequestContext remains online; this is a separate server-side fixture.
  await createClient(page, remote);
  await context.setOffline(false);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(
    "Bozza in memoria",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: `Apri scheda di ${remote} W18`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 5000 });
  expect(writes).toBe(0);
});

test("returning to the foreground revalidates data inside the normal freshness window", async ({
  page,
}) => {
  await login(page, await account());
  await page.goto("/app/clienti");
  await expect(
    page.getByRole("button", { name: "Nuova cliente", exact: true }),
  ).toBeVisible();
  await visibility(page, "hidden");
  const remote = `Ripresa-${crypto.randomUUID().slice(0, 8)}`;
  await createClient(page, remote);
  await visibility(page, "visible");
  await expect(
    page.getByRole("button", {
      name: `Apri scheda di ${remote} W18`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 5000 });
});

test("a suspended colleague loses the workspace immediately on foreground revalidation", async ({
  page,
}) => {
  const owner = await account(),
    colleague = await account(false);
  const invite = await owner.db.rpc("create_team_invitation", {
    p_email: colleague.email,
    p_clinical_access: false,
  });
  expect(invite.error).toBeNull();
  const accepted = await colleague.db.rpc("accept_team_invitation", {
    p_token: (invite.data as { token: string }).token,
    p_display_name: "Operatrice W18",
  });
  expect(accepted.error).toBeNull();
  await login(page, colleague);
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  await visibility(page, "hidden");
  const member = await owner.db
    .from("users")
    .select("version")
    .eq("id", colleague.id)
    .single();
  expect(member.error).toBeNull();
  const suspended = await owner.db.rpc("update_team_member", {
    p_id: colleague.id,
    p_version: member.data!.version,
    p_active: false,
    p_clinical_access: false,
  });
  expect(suspended.error).toBeNull();
  await visibility(page, "visible");
  await expect(page).toHaveURL(/\/accesso-sospeso$/, { timeout: 5000 });
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/clients")).status()).toBe(403);
});

test("touch forms retain readable font sizes and stay usable in portrait and landscape", async ({
  page,
}, testInfo) => {
  await login(page, await account());
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: "Nuova cliente", exact: true })
    .click();
  const field = page.getByLabel("Nome", { exact: true });
  await field.fill("Cliente touch");
  const original = page.viewportSize()!;
  for (const viewport of [
    original,
    { width: original.height, height: original.width },
  ]) {
    await page.setViewportSize(viewport);
    await expect(field).toBeVisible();
    if (testInfo.project.use.hasTouch)
      expect(
        await field.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    expect(
      await field.evaluate((e) => e.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const dialog = page.getByRole("dialog");
    await expect
      .poll(async () => (await dialog.boundingBox())!.y)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(viewport.height + 1);
    await testInfo.attach(`viewport-${viewport.width}`, {
      body: JSON.stringify(
        await field.evaluate((e) => ({
          font: getComputedStyle(e).fontSize,
          height: innerHeight,
          viewport: visualViewport?.height,
          offset: visualViewport?.offsetTop,
          dialog: e.closest("[role=dialog]")?.getBoundingClientRect().toJSON(),
        })),
      ),
      contentType: "application/json",
    });
    await page
      .getByRole("button", { name: "Salva cliente", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Salva cliente", exact: true }),
    ).toBeInViewport();
  }
  await expect(field).toHaveValue("Cliente touch");
});

test("private views never populate offline stores and logout discards the previous workspace", async ({
  page,
}) => {
  const user = await account();
  await login(page, user);
  const name = `Privata-${crypto.randomUUID().slice(0, 8)}`;
  await createClient(page, name);
  await page.goto("/app/clienti");
  await expect(
    page.getByRole("button", {
      name: `Apri scheda di ${name} W18`,
      exact: true,
    }),
  ).toBeVisible();
  const stores = await page.evaluate(async () => ({
    workers: (await navigator.serviceWorker.getRegistrations()).length,
    caches: await caches.keys(),
    databases: await indexedDB.databases(),
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(stores.workers).toBe(0);
  expect(stores.caches).toEqual([]);
  expect(stores.databases).toEqual([]);
  expect(stores.local + stores.session).not.toContain(name);
  await page
    .getByRole("button", { name: "Apri menu di Giulia Bianchi" })
    .click();
  await page.getByRole("menuitem", { name: "Esci dal tuo account" }).click();
  await expect(page).toHaveURL(/\/accedi/);
  await page.goBack();
  await expect(page).toHaveURL(/\/accedi/);
  await expect(page.getByText(name)).toHaveCount(0);
  expect((await page.request.get("/api/clients")).status()).toBe(401);
});
