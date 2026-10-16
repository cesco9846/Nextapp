import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import type { IntakeCreated } from "@/lib/intake";
import type { SignatureContext } from "@/lib/consents";
import { origin } from "./helpers";
export async function issueSignature(
  page: Page,
  id: string,
  preparationVersion = 1,
) {
  const r = await page.request.post(`/api/appointments/${id}/consents`, {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      appointment_version: 1,
      preparation_version: preparationVersion,
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as IntakeCreated;
}
export async function readSignature(page: Page, token: string) {
  const r = await page.request.post("/api/consent/read", {
    headers: origin,
    data: { token },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).context as SignatureContext;
}
export const signatureStrokes = [
  [
    [0.1, 0.2],
    [0.2, 0.3],
    [0.3, 0.4],
    [0.4, 0.3],
    [0.5, 0.2],
    [0.6, 0.4],
  ],
];
export function signBody(token: string, context: SignatureContext) {
  return {
    token,
    request_id: crypto.randomUUID(),
    snapshot_hash: context.snapshot_hash,
    signer_name: "Elena di prova",
    confirmed: true,
    signature: signatureStrokes,
  };
}
export async function fillSignature(page: Page) {
  await page.getByLabel("Il tuo nome e cognome").fill("Elena di prova");
  const canvas = page.getByRole("application", { name: "Spazio per la firma" });
  await canvas.focus();
  await canvas.press("Enter");
  for (const key of [
    "ArrowRight",
    "ArrowDown",
    "ArrowRight",
    "ArrowUp",
    "ArrowRight",
    "ArrowDown",
    "ArrowRight",
    "ArrowRight",
  ])
    await canvas.press(key);
  await canvas.press("Enter");
  await page.getByRole("checkbox").check();
}
export async function documentList(page: Page, appointment: string) {
  const r = await page.request.get(`/api/appointments/${appointment}/consents`);
  expect(r.status()).toBe(200);
  return (await r.json()) as {
    documents: {
      id: string;
      document_state: string;
      content_hash: string;
      signed_at: string;
    }[];
  };
}
export function documentSql(sql: string) {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
    )
  )
    throw new Error("Only local fixtures");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_Nextapp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
}
