import { expect, test, type APIRequestContext } from "@playwright/test";

async function localEmailLink(
  request: APIRequestContext,
  email: string,
  excluded: string[] = [],
) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://127.0.0.1:54324/api/v1/messages",
        );
        const inbox = (await response.json()) as {
          messages: { ID: string; To: { Address: string }[] }[];
        };
        id = inbox.messages.find(
          (message) =>
            !excluded.includes(message.ID) &&
            message.To.some((to) => to.Address === email),
        )?.ID;
        return !!id;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const response = await request.get(
    `http://127.0.0.1:54324/api/v1/message/${id}`,
  );
  const message = (await response.json()) as { HTML: string; Text: string };
  const match = `${message.HTML}\n${message.Text}`
    .replaceAll("&amp;", "&")
    .match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/);
  if (!match) throw new Error("Local Auth email lacks its verification link");
  const link = new URL(match[0]);
  if (!["localhost", "127.0.0.1"].includes(link.hostname))
    throw new Error("Auth email test must stay on loopback");
  return link.href;
}

test("signup confirmation and password recovery work with real local Auth emails", async ({
  page,
  request,
}) => {
  const email = `signup-${crypto.randomUUID()}@example.invalid`;
  const password = `Signup-${crypto.randomUUID()}!`;
  await page.goto("/accedi");
  await page.getByRole("tab", { name: "Crea account", exact: true }).click();
  await page.getByLabel("Email professionale").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Crea il tuo account", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Controlla la tua email" }),
  ).toBeVisible();
  await page.goto(await localEmailLink(request, email));
  await expect(page).toHaveURL(/\/configurazione$/);
  await page.getByLabel("Il tuo nome").fill("Francesca Verdi");
  await page.getByLabel("Nome dello studio").fill("Studio Verdi");
  await page.getByLabel("Nome della sede").fill("Sede principale");
  await page.getByLabel("Nome del servizio").fill("Prima consulenza");
  await page.getByRole("button", { name: "Apri la mia agenda" }).click();
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apri menu di Francesca Verdi" })
    .click();
  await page.getByRole("menuitem", { name: "Esci dal tuo account" }).click();
  await expect(page).toHaveURL(/\/accedi$/);
  // Wait for a new email instead of reusing the already consumed signup link.
  const inbox = await (
    await request.get("http://127.0.0.1:54324/api/v1/messages")
  ).json();
  const previousIds = (inbox.messages as { ID: string }[]).map(
    (message) => message.ID,
  );
  await page
    .getByRole("button", { name: "Hai dimenticato la password?" })
    .click();
  await page.getByLabel("Email professionale").fill(email);
  await page
    .getByRole("button", { name: "Invia collegamento", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Se l'indirizzo è associato" }),
  ).toBeVisible();
  await page.goto(await localEmailLink(request, email, previousIds));
  await expect(page).toHaveURL(/\/nuova-password$/);
  const nextPassword = `Changed-${crypto.randomUUID()}!`;
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page
    .getByRole("button", { name: "Aggiorna password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/agenda$/);
  await page
    .getByRole("button", { name: "Apri menu di Francesca Verdi" })
    .click();
  await page.getByRole("menuitem", { name: "Esci dal tuo account" }).click();
  await expect(page).toHaveURL(/\/accedi$/);
  await page.getByLabel("Email professionale").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Accedi al tuo studio" }).click();
  await expect(
    page.getByRole("heading", { name: "La tua agenda" }),
  ).toBeVisible();
});

test("an invalid confirmation link cannot redirect outside Glow and offers recovery", async ({
  page,
}) => {
  await page.goto(
    "/auth/conferma?code=invalid-test-code&next=https://example.invalid",
  );
  await expect(page).toHaveURL(
    "http://localhost:3100/accedi?errore=collegamento",
  );
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "collegamento di conferma è scaduto" }),
  ).toBeVisible();
});
