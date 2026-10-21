import { z } from "zod";

export const privacyCategories = {
  contacts: "Contatti e appuntamenti",
  clinical: "Dossier, consensi e foto",
  audit: "Tracce di accesso e modifiche",
} as const;
const rule = z
  .object({
    months: z.number().int().min(1).max(600).nullable(),
    basis: z.string().max(1000),
  })
  .strict();
export const privacySettingsInput = z
  .object({
    version: z.number().int().min(0),
    rules: z.object({ contacts: rule, clinical: rule, audit: rule }).strict(),
    notice: z.string().max(12000),
    contact_email: z.union([z.email().max(254), z.literal("")]),
    reviewed: z.boolean(),
  })
  .strict();
export type PrivacySettingsInput = z.infer<typeof privacySettingsInput>;
export const privacyRequestStates = {
  received: "Ricevuta",
  reviewing: "In verifica",
  retained: "Dati da conservare",
  rejected: "Identità non verificata",
  withdrawn: "Ritirata",
} as const;
export const privacyRequestInput = z
  .object({ id: z.uuid(), client_id: z.uuid() })
  .strict();
export const privacyRequestUpdate = z
  .object({
    version: z.number().int().positive(),
    state: z.enum(["reviewing", "retained", "rejected", "withdrawn"]),
    identity_verified: z.boolean(),
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

export function csvCell(value: unknown) {
  let text = String(value ?? "").replaceAll("\0", "");
  // Quoting alone does not prevent spreadsheet formula execution. Protect
  // leading controls/whitespace as well as ordinary formula prefixes.
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvRows(headers: string[], rows: unknown[][]) {
  return (
    "\ufeff" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export const exportFileSchema = z.object({
  id: z.uuid(),
  bucket: z.enum(["glow-private", "glow-documents"]),
  path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-zA-Z0-9.-]+$/),
  name: z
    .string()
    .regex(/^(allegati|consensi)\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(26214400),
});
export const exportSnapshotSchema = z
  .object({
    schema: z.literal("glow-client-export-v1"),
    exported_at: z.string(),
    client: z
      .object({
        id: z.uuid(),
        first_name: z.string(),
        last_name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
      })
      .passthrough(),
    appointments: z.array(
      z
        .object({
          id: z.uuid(),
          starts_at: z.string(),
          ends_at: z.string(),
          status: z.string(),
          service_name: z.string(),
          location_name: z.string(),
          operator_name: z.string(),
          price_cents: z.number(),
        })
        .passthrough(),
    ),
    preparations: z.array(z.unknown()),
    templates: z.array(z.unknown()),
    treatment_lots: z.array(z.unknown()),
    consents: z.array(z.unknown()),
    photos: z.array(z.unknown()),
    photo_permissions: z.array(z.unknown()),
    privacy_requests: z.array(z.unknown()),
    intake_links: z.array(z.unknown()),
    signature_requests: z.array(z.unknown()),
    messages: z.array(z.unknown()),
    appointment_responses: z.array(z.unknown()),
    audit: z.array(z.unknown()),
    files: z.array(exportFileSchema).max(200),
  })
  .strict();
