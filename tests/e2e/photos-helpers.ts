import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, type Page } from "@playwright/test";
import { origin } from "./helpers";
import { issueSignature, readSignature, signBody } from "./documents-helpers";
export async function authorizePhotos(
  page: Page,
  appointment: string,
  choices = { documentation: true, demonstration: false },
  revision = 1,
) {
  const link = await issueSignature(page, appointment, revision);
  const context = await readSignature(page, link.token!);
  const response = await page.request.post("/api/consent/sign", {
    headers: origin,
    data: { ...signBody(link.token!, context), photo_choices: choices },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).receipt as { id: string };
}
export async function syntheticPhoto(color = "#28664f", orientation?: number) {
  // Clearly synthetic fixture, not a patient photograph or shipping asset.
  return sharp(
    Buffer.from(
      `<svg width="3000" height="2000"><rect width="3000" height="2000" fill="${color}"/><rect x="80" y="80" width="700" height="400" fill="#ffffff"/><text x="100" y="240" font-size="100">PROVA SINTETICA</text></svg>`,
    ),
  )
    .withMetadata(orientation ? { orientation } : {})
    .jpeg()
    .toBuffer();
}
export async function preparePhoto(
  page: Page,
  client: string,
  appointment: string,
  bytes: Buffer,
  category = "before",
  request = crypto.randomUUID(),
) {
  const body = {
    request_id: request,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mime_type: "image/jpeg",
    appointment_id: appointment,
    category,
  };
  const response = await page.request.post(`/api/clients/${client}/photos`, {
    headers: origin,
    data: body,
  });
  return { response, body };
}
export async function photos(
  page: Page,
  client: string,
  appointment: string,
  pageNumber = 0,
) {
  const response = await page.request.get(
    `/api/clients/${client}/photos?appointment=${appointment}&page=${pageNumber}`,
  );
  expect(response.status()).toBe(200);
  return response.json();
}
