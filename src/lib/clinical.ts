import { z } from "zod";
import type { Row } from "./types";

export const questionSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200),
    type: z.enum(["yes_no", "text"]),
    required: z.boolean(),
  })
  .strict();
export type Question = z.infer<typeof questionSchema>;
export const templatePublishSchema = z
  .object({
    request_id: z.uuid(),
    template_id: z.uuid().nullable(),
    version: z.number().int().min(0),
    kind: z.enum(["consent", "anamnesis"]),
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(10).max(12000),
    questions: z.array(questionSchema).max(30),
    service_id: z.uuid().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.kind === "consent" && data.questions.length)
      ctx.addIssue({
        code: "custom",
        message: "Le domande appartengono al modello di anamnesi.",
      });
    if (new Set(data.questions.map((q) => q.id)).size !== data.questions.length)
      ctx.addIssue({
        code: "custom",
        message: "Ogni domanda deve avere un identificativo distinto.",
      });
  });
export const activeSchema = z
  .object({ version: z.number().int().positive(), active: z.boolean() })
  .strict();
export const pigmentSchema = z
  .object({
    request_id: z.uuid(),
    id: z.uuid().nullable(),
    version: z.number().int().min(0),
    brand: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().max(100),
    active: z.boolean(),
  })
  .strict();
export const lotSchema = z
  .object({
    request_id: z.uuid(),
    id: z.uuid().nullable(),
    version: z.number().int().min(0),
    pigment_id: z.uuid(),
    lot_number: z.string().trim().min(1).max(100),
    expires_on: z.iso.date(),
    label_file_id: z.uuid(),
    label_text: z.string().trim().max(2000),
    active: z.boolean(),
  })
  .strict();
export const preparationSaveSchema = z
  .object({
    request_id: z.uuid(),
    appointment_version: z.number().int().positive(),
    version: z.number().int().min(0),
    consent_version_id: z.uuid(),
    anamnesis_version_id: z.uuid().nullable(),
    answers: z.record(z.uuid(), z.union([z.boolean(), z.string().max(500)])),
    lot_ids: z.array(z.uuid()).max(12),
  })
  .strict();
export const versionSchema = z.object({
  id: z.uuid(),
  template_id: z.uuid(),
  revision: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  questions: z.array(questionSchema),
  content_hash: z.string(),
  published_at: z.string(),
});
export type TemplateVersion = z.infer<typeof versionSchema>;
export type ClinicalTemplate = Row<"clinical_templates">;
export type Pigment = Row<"pigments">;
export type PigmentLot = Row<"pigment_lots">;
export type LotListEntry = PigmentLot & {
  pigment: Pick<Pigment, "id" | "brand" | "name" | "code" | "active">;
};
export type CatalogPage<T> = { items: T[]; total: number; page: number };
export type TemplateDetail = {
  template: ClinicalTemplate;
  current: TemplateVersion;
  history: Pick<
    TemplateVersion,
    "id" | "revision" | "title" | "published_at"
  >[];
};
export const lotSnapshotSchema = z.object({
  brand: z.string(),
  name: z.string(),
  code: z.string(),
  lot_number: z.string(),
  expires_on: z.string(),
  label_file_id: z.uuid(),
  label_sha256: z.string(),
  label_text: z.string(),
  lot_version: z.number(),
  pigment_version: z.number(),
});
export const preparationContextSchema = z.object({
  appointment: z.object({
    id: z.uuid(),
    client_id: z.uuid(),
    service_id: z.uuid(),
    service_name: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    status: z.string(),
    version: z.number(),
  }),
  client: z.object({
    id: z.uuid(),
    first_name: z.string(),
    last_name: z.string(),
  }),
  preparation: z
    .object({
      id: z.uuid(),
      version: z.number(),
      status: z.literal("draft"),
      appointment_version: z.number(),
      consent_version_id: z.uuid(),
      anamnesis_version_id: z.uuid().nullable(),
    })
    .nullable(),
  answers: z.record(z.string(), z.union([z.boolean(), z.string()])),
  consent: versionSchema.nullable(),
  anamnesis: versionSchema.nullable(),
  lots: z.array(z.object({ lot_id: z.uuid(), snapshot: lotSnapshotSchema })),
});
export type PreparationContext = z.infer<typeof preparationContextSchema>;
