import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";
import type { CreatedInvitation, Team } from "@/lib/types";
import { Temporal } from "temporal-polyfill";

test("an invited colleague joins, receives an assignment and loses access when suspended", async ({
  page,
  browser,
}) => {
  const owner = await account();
  const colleague = await account(false);
  await login(page, owner);
  await page.goto("/app/team");
  await page.getByLabel("Email dell’operatrice").fill(colleague.email);
  await page
    .getByRole("checkbox", { name: "Abilita accesso ai dossier nell’invito" })
    .check();
  await page
    .getByRole("button", { name: "Crea collegamento", exact: true })
    .click();
  const input = page.getByLabel("Collegamento da condividere");
  await expect(input).toHaveValue(/\/invito#[a-f0-9]{64}$/);
  const link = await input.inputValue();
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await staffPage.goto(link);
  await staffPage.getByLabel("Email professionale").fill(colleague.email);
  await staffPage
    .getByLabel("Password", { exact: true })
    .fill(colleague.password);
  await staffPage.getByRole("button", { name: "Accedi al tuo studio" }).click();
  await staffPage.getByLabel("Come ti chiami?").fill("Claudia Neri");
  await staffPage
    .getByRole("button", { name: "Accetta invito", exact: true })
    .click();
  await expect(staffPage).toHaveURL(/\/app\/agenda$/);
  await expect(
    staffPage.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  expect((await staffPage.request.get("/api/team")).status()).toBe(403);
  await staffPage.goto("http://localhost:3100/app/team");
  await expect(staffPage).toHaveURL(/\/app\/impostazioni$/);
  const created = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: "Cliente", last_name: "Team", phone: "", email: "" },
  });
  const client = await created.json();
  expect(created.status()).toBe(201);
  expect(
    (
      await colleague.db.rpc("can_access_client_clinical", {
        p_client_id: client.id,
      })
    ).data,
  ).toBe(false);
  await page.goto("/app/clienti");
  await page.getByRole("button", { name: "Cliente Team", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Assegna Claudia Neri", exact: true })
    .click();
  await expect(page.getByRole("checkbox", { name: "Assegna Claudia Neri", exact: true })).toBeChecked();
  await expect
    .poll(
      async () =>
        (
          await colleague.db.rpc("can_access_client_clinical", {
            p_client_id: client.id,
          })
        ).data,
    )
    .toBe(true);
  await page.goto("/app/team");
  await page
    .getByRole("button", {
      name: "Sospendi accesso di Claudia Neri",
      exact: true,
    })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Sospendi accesso", exact: true })
    .click();
  await expect(
    page.getByText("Accesso sospeso", { exact: true }),
  ).toBeVisible();
  expect((await staffPage.request.get("/api/clients")).status()).toBe(403);
  expect((await colleague.db.from("clients").select("id")).data).toEqual([]);
  await staffPage.goto("http://localhost:3100/app/agenda");
  await expect(staffPage).toHaveURL(/\/accesso-sospeso$/);
  await expect(
    staffPage.getByRole("heading", { name: "Accesso allo studio sospeso" }),
  ).toBeVisible();
  expect(
    (
      await staffPage.request.post("/api/workspace", {
        headers: origin,
        data: {
          name: "Bypass",
          display_name: "Bypass",
          location: "Bypass",
          service: "Bypass",
          duration: 60,
          price: 0,
        },
      })
    ).status(),
  ).toBe(403);
  await page
    .getByRole("button", {
      name: "Riattiva accesso di Claudia Neri",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Accesso sospeso", { exact: true }),
  ).not.toBeVisible();
  expect(
    (
      await colleague.db.rpc("can_access_client_clinical", {
        p_client_id: client.id,
      })
    ).data,
  ).toBe(false);
  await staffPage.goto("http://localhost:3100/app/agenda");
  await expect(
    staffPage.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  await staffContext.close();
});

test("invitation revocation, reissue and concurrent acceptance keep one membership", async ({
  page,
}) => {
  const owner = await account();
  const invited = await account(false);
  const otherOwner = await account();
  await login(page, owner);
  async function invite(email: string) {
    const response = await page.request.post("/api/team/invitations", {
      headers: origin,
      data: { email, clinical_access: false },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as CreatedInvitation;
  }
  expect(
    (
      await page.request.post("/api/team/invitations", {
        headers: origin,
        data: { email: invited.email, clinical_access: true, role: "owner" },
      })
    ).status(),
  ).toBe(422);
  const revoked = await invite(invited.email);
  await page.goto("/app/team");
  await page
    .getByRole("button", {
      name: `Revoca invito per ${invited.email}`,
      exact: true,
    })
    .click();
  await expect(page.getByText("Revocato", { exact: true })).toBeVisible();
  expect(
    (
      await invited.db.rpc("accept_team_invitation", {
        p_token: revoked.token,
        p_display_name: "Revoked",
      })
    ).error?.code,
  ).toBe("22023");
  const previous = await invite(invited.email);
  const current = await invite(invited.email);
  expect(current.token).not.toBe(previous.token);
  expect(
    (
      await invited.db.rpc("accept_team_invitation", {
        p_token: previous.token,
        p_display_name: "Old",
      })
    ).error?.code,
  ).toBe("22023");
  expect(
    (await otherOwner.db.rpc("revoke_team_invitation", { p_id: current.id }))
      .error?.code,
  ).toBe("P0002");
  const attempts = await Promise.all(
    [0, 1].map(() =>
      invited.db.rpc("accept_team_invitation", {
        p_token: current.token,
        p_display_name: "Concurrent Colleague",
      }),
    ),
  );
  attempts.forEach((result) => expect(result.error).toBeNull());
  expect(attempts[0].data).toBe(attempts[1].data);
  const team = (await (await page.request.get("/api/team")).json()) as Team;
  expect(
    team.members.filter((member) => member.id === invited.id),
  ).toHaveLength(1);
  expect(team.members.find((member) => member.id === invited.id)?.role).toBe(
    "operator",
  );
  const forExistingOwner = await invite(otherOwner.email);
  expect(
    (
      await otherOwner.db.rpc("accept_team_invitation", {
        p_token: forExistingOwner.token,
        p_display_name: "Move owner",
      })
    ).error?.code,
  ).toBe("22023");
  expect(
    (await owner.db.from("user_invitations").select("token_hash")).error?.code,
  ).toBe("42501");
  expect(
    (await otherOwner.db.from("user_invitations").select("id")).data,
  ).toEqual([]);
});

test("connection loss does not queue a save and reconnect requires an explicit retry", async ({
  page,
  context,
}) => {
  const owner = await account();
  await login(page, owner);
  await page.goto("/app/clienti");
  await page
    .getByRole("button", { name: "Nuova cliente", exact: true })
    .click();
  const firstName = `Offline-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nome", { exact: true }).fill(firstName);
  await page.getByLabel("Cognome", { exact: true }).fill("Retry");
  let requests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/clients"
    )
      requests++;
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
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(firstName);
  expect(requests).toBe(0);
  await context.setOffline(false);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Glow richiede Internet" })
      .first(),
  ).not.toBeVisible();
  const existing = await page.request.get(`/api/clients?q=${firstName}`);
  expect((await existing.json()).clients).toHaveLength(0);
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "Salva cliente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `${firstName} Retry`, exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("install controls keep the browser prompt through navigation and preserve a manual fallback", async ({
  page,
}) => {
  await login(page, await account());
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.body.dataset.installPrompt = "opened";
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await page
    .getByRole("navigation", { name: "Navigazione principale" })
    .getByRole("link", { name: "Il tuo studio" })
    .click();
  await page
    .getByRole("button", { name: "Installa Glow", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-install-prompt",
    "opened",
  );
  await expect(
    page.getByRole("button", { name: "Installa Glow", exact: true }),
  ).not.toBeVisible();
  await expect(page.getByText(/iPhone e iPad:/)).toBeVisible();
  await expect(
    page.getByText(/sempre necessaria una connessione a Internet/),
  ).toBeVisible();
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.name).toBe("Glow");
  expect(manifest.display).toBe("standalone");
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0);
});

test("a lost booking response is reported as uncertain and an explicit retry does not duplicate it", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  const clientResponse = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: "Network", last_name: "Retry", phone: "", email: "" },
  });
  expect(clientResponse.status()).toBe(201);
  await page
    .getByRole("button", { name: "Nuovo appuntamento", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await page
    .getByRole("option", { name: "Network Retry", exact: true })
    .click();
  const day = Temporal.Now.zonedDateTimeISO("Europe/Rome")
    .toPlainDate()
    .toString();
  await page.getByLabel("Data e ora").fill(`${day}T10:00`);
  let intercepted = false;
  await page.route("**/api/appointments", async (route) => {
    if (!intercepted && route.request().method() === "POST") {
      intercepted = true;
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Prenota appuntamento", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "non è stato possibile confermare l’esito" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Un nuovo appuntamento" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prenota appuntamento", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Un nuovo appuntamento" }),
  ).not.toBeVisible();
  const saved = await owner.db.from("appointments").select("id");
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(1);
});
