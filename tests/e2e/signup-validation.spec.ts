import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

for (const [label, password] of [
  ["autofilled short value", "shortpass"],
  ["five non-BMP characters", "🔒".repeat(5)],
] as const) {
  test(`signup rejects ${label} before making an Auth request`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/auth/v1/signup**", async (route) => {
      requests++;
      await route.fulfill({
        status: 422,
        json: {
          code: "weak_password",
          msg: "Password should be at least 10 characters.",
          weak_password: { reasons: ["length"] },
        },
      });
    });
    await page.goto("/accedi");
    await page.getByRole("tab", { name: "Crea account", exact: true }).click();
    await page
      .getByLabel("Email professionale")
      .fill("signup-guard@example.invalid");
    const field = page.getByLabel("Password", { exact: true });
    // Password managers/programmatic fills can bypass native minlength checks.
    await field.evaluate((input: HTMLInputElement, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, password);
    expect(
      await field.evaluate(
        (input: HTMLInputElement) => input.validity.tooShort,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Crea il tuo account", exact: true })
      .click();
    await expect(page.locator("#auth-error")).toHaveText(
      "La password deve contenere almeno 10 caratteri.",
    );
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(password);
    await expect(
      page.getByRole("button", { name: "Crea il tuo account", exact: true }),
    ).toBeEnabled();
    expect(requests).toBe(0);
    const directory = process.env.GLOW_AUTH_CAPTURE_DIR;
    if (directory && label === "autofilled short value") {
      await mkdir(resolve(directory), { recursive: true });
      for (const width of [375, 820, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: resolve(directory, `short-${width}.png`),
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  });
}

test("server weak-password errors remain actionable without exposing raw provider messages", async ({
  page,
}) => {
  await page.route("**/auth/v1/signup**", async (route) =>
    route.fulfill({
      status: 422,
      json: {
        code: "weak_password",
        msg: "private provider diagnostics must not be exposed",
        weak_password: { reasons: ["length"] },
      },
    }),
  );
  await page.goto("/accedi");
  await page.getByRole("tab", { name: "Crea account", exact: true }).click();
  await page
    .getByLabel("Email professionale")
    .fill("signup-server@example.invalid");
  const field = page.getByLabel("Password", { exact: true });
  await field.fill("Synthetic-strong-passphrase-123!");
  await page
    .getByRole("button", { name: "Crea il tuo account", exact: true })
    .click();
  await expect(page.locator("#auth-error")).toHaveText(
    "La password deve contenere almeno 10 caratteri.",
  );
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();
  await expect(
    page.getByText("private provider diagnostics", { exact: false }),
  ).toHaveCount(0);
  // Unknown strength reasons must not be misreported as a length-only error.
  await page.unroute("**/auth/v1/signup**");
  await page.route("**/auth/v1/signup**", async (route) =>
    route.fulfill({
      status: 422,
      json: {
        code: "weak_password",
        msg: "private diagnostic",
        weak_password: { reasons: ["pwned"] },
      },
    }),
  );
  await field.fill("Synthetic-other-passphrase-456!");
  await page
    .getByRole("button", { name: "Crea il tuo account", exact: true })
    .click();
  await expect(page.locator("#auth-error")).toHaveText(
    "Scegli una password di almeno 10 caratteri, più difficile da indovinare.",
  );
  const directory = process.env.GLOW_AUTH_CAPTURE_DIR;
  if (directory) {
    for (const width of [375, 820, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(directory, `weak-${width}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("login still submits existing passwords shorter than the new-account policy", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/auth/v1/token**", async (route) => {
    requests++;
    await route.fulfill({
      status: 400,
      json: { code: "invalid_credentials", msg: "Invalid login credentials" },
    });
  });
  await page.goto("/accedi");
  await page
    .getByLabel("Email professionale")
    .fill("existing-account@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("shortpass");
  await page
    .getByRole("button", { name: "Accedi al tuo studio", exact: true })
    .click();
  await expect(page.locator("#auth-error")).toContainText(
    "Non è stato possibile accedere",
  );
  expect(requests).toBe(1);
  await expect(
    page.getByLabel("Password", { exact: true }),
  ).not.toHaveAttribute("aria-invalid", "true");
});
