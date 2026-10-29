import { expect, test } from "@playwright/test";
import { account, login } from "./helpers";

test("locally verified tokens cannot keep using an Auth session after global logout", async ({
  page,
  browser,
}) => {
  const owner = await account();
  await login(page, owner);
  const before = await page.request.get("/api/workspace");
  expect(before.status()).toBe(200);
  expect(before.headers()["server-timing"]).toMatch(/auth;dur=/);
  expect(before.headers()["server-timing"]).toMatch(/profile;dur=/);
  const copied = await browser.newContext();
  await copied.addCookies(await page.context().cookies());
  const signedOut = await owner.db.auth.signOut({ scope: "global" });
  expect(signedOut.error).toBeNull();
  // Cookie still carries an otherwise valid signed JWT. The DB-backed session
  // profile must reject it without waiting an hour for exp.
  const stale = await copied.request.get("/api/clients");
  expect(stale.status()).toBe(401);
  expect((await stale.json()).code).toBe("AUTH_REQUIRED");
  await copied.close();
});

test("render memoization never shares session or workspace data between simultaneous users", async ({
  browser,
}) => {
  const one = await account();
  const two = await account();
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  await login(await contexts[0].newPage(), one);
  await login(await contexts[1].newPage(), two);
  await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const context = contexts[i % 2];
      const response = await context.request.get("/api/workspace");
      expect(response.status()).toBe(200);
      expect((await response.json()).profile.id).toBe(
        i % 2 === 0 ? one.id : two.id,
      );
    }),
  );
  await Promise.all(contexts.map((context) => context.close()));
});
