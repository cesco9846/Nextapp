import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";

async function capture(page: Page, name: string) {
  if (process.env.GLOW_CAPTURE_REVIEW !== "1") return;
  await mkdir(".impeccable/review/stabilization", { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `.impeccable/review/stabilization/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

for (const width of [375, 820, 1280]) {
  test(`client search coalesces typing and preserves safe rows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const owner = await account();
    await login(page, owner);
    for (const name of ["Aurora", "Bianca"]) {
      const result = await page.request.post("/api/clients", {
        headers: origin,
        data: {
          first_name: "Cliente sintetica",
          last_name: name,
          email: "",
          phone: "",
        },
      });
      expect(result.status()).toBe(201);
    }
    await page.goto("/app/clienti");
    const aurora = page.getByRole("button", {
      name: "Apri scheda di Cliente sintetica Aurora",
      exact: true,
    });
    await expect(aurora).toBeVisible();
    await capture(page, `clients-${width}-ready`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const searches: string[] = [];
    await page.route("**/api/clients?*", async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q");
      if (q) searches.push(q);
      if (q === "Aurora") await gate;
      await route.continue();
    });
    const search = page.getByRole("textbox", { name: "Cerca clienti" });
    await search.pressSequentially("Aurora", { delay: 35 });
    await expect.poll(() => searches).toEqual(["Aurora"]);
    await expect(aurora).toBeVisible();
    await expect(aurora).toBeDisabled();
    await expect(
      page.getByText("Aggiornamento elenco…", { exact: true }),
    ).toBeVisible();
    await capture(page, `clients-${width}-updating`);
    release();
    await expect(aurora).toBeEnabled();
    await expect(
      page.getByRole("button", {
        name: "Apri scheda di Cliente sintetica Bianca",
        exact: true,
      }),
    ).toHaveCount(0);
    await search.fill("Nessuna corrispondenza sintetica");
    await expect(
      page.getByRole("heading", {
        name: "Nessuna corrispondenza",
        exact: true,
      }),
    ).toBeVisible();
    await capture(page, `clients-${width}-empty`);
    await page.unroute("**/api/clients?*");
    await page.route("**/api/clients?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Servizio temporaneamente non disponibile. Riprova.",
          code: "TEMPORARY_FAILURE",
        }),
      }),
    );
    await search.fill("Riprova sintetica");
    await expect(
      page.getByRole("alert").filter({ hasText: "Servizio temporaneamente" }),
    ).toBeVisible();
    await capture(page, `clients-${width}-error`);
    await page.unroute("**/api/clients?*");
    await page.getByRole("button", { name: "Riprova", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Nessuna corrispondenza",
        exact: true,
      }),
    ).toBeVisible();
    const agendaRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/appointments")
        agendaRequests.push(request.url());
    });
    await page.goto("/app/agenda");
    await expect(
      page.getByRole("heading", { name: "La tua agenda", exact: true }),
    ).toBeVisible();
    await expect.poll(() => agendaRequests.length).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    expect(agendaRequests).toHaveLength(1);
    await capture(page, `agenda-${width}-ready`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("idle membership polling avoids catalog reads and still removes a suspended operator", async ({
  page,
}) => {
  test.setTimeout(60000);
  const owner = await account();
  const colleague = await account(false);
  const invite = await owner.db.rpc("create_team_invitation", {
    p_email: colleague.email,
    p_clinical_access: false,
  });
  expect(invite.error).toBeNull();
  const accepted = await colleague.db.rpc("accept_team_invitation", {
    p_token: (invite.data as { token: string }).token,
    p_display_name: "Operatrice sintetica",
  });
  expect(accepted.error).toBeNull();
  await login(page, colleague);
  await page.goto("/app/clienti");
  await expect(
    page.getByRole("heading", { name: "Diamo un nome alla prima seduta" }),
  ).toBeVisible();
  let catalogReads = 0;
  let memberships = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/workspace") catalogReads++;
    if (path === "/api/membership") memberships++;
  });
  await expect.poll(() => memberships, { timeout: 20000 }).toBeGreaterThan(0);
  expect(catalogReads).toBe(0);
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
  await expect(page).toHaveURL(/\/accesso-sospeso$/, { timeout: 20000 });
});
