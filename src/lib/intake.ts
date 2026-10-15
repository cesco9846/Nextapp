import { z } from "zod";
import { questionSchema } from "./clinical";
export const intakeIssueSchema = z
  .object({
    request_id: z.uuid(),
    appointment_version: z.number().int().positive(),
    preparation_version: z.number().int().positive(),
  })
  .strict();
export const intakeLinkSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["link", "tablet"]),
  created_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  used_at: z.string().nullable(),
  appointment_version: z.number(),
  preparation_version: z.number(),
  version: z.number(),
});
export type IntakeLink = z.infer<typeof intakeLinkSchema>;
export const intakeCreatedSchema = z.object({
  link: intakeLinkSchema,
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export type IntakeCreated = z.infer<typeof intakeCreatedSchema>;
export const intakeTokenSchema = z
  .string()
  .regex(
    /^[a-f0-9]{64}$/,
    "Il collegamento non è valido. Riapri il link ricevuto dallo studio.",
  );
export const intakeReadSchema = z.object({ token: intakeTokenSchema }).strict();
export const intakeSubmitSchema = z
  .object({
    token: intakeTokenSchema,
    request_id: z.uuid(),
    confirm_read: z.literal(true),
    answers: z
      .record(z.uuid(), z.union([z.boolean(), z.string().max(500)]))
      .refine((value) => Object.keys(value).length <= 30),
  })
  .strict();
const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  title: z.string(),
  body: z.string(),
});
export const intakeContextSchema = z.object({
  mode: z.enum(["link", "tablet"]),
  expires_at: z.string(),
  studio: z.string(),
  timezone: z.string(),
  first_name: z.string(),
  service_name: z.string(),
  starts_at: z.string(),
  consent: documentSchema,
  anamnesis: documentSchema
    .extend({ questions: z.array(questionSchema) })
    .nullable(),
});
export type IntakeContext = z.infer<typeof intakeContextSchema>;
export const intakeReceiptSchema = z.object({
  id: z.uuid(),
  submitted_at: z.string(),
});
export type IntakeReceipt = z.infer<typeof intakeReceiptSchema>;
