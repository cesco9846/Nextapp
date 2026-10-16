import { z } from "zod";
import { questionSchema, lotSnapshotSchema } from "./clinical";
import { intakeTokenSchema } from "./intake";

export const handwritingSchema = z
  .array(
    z
      .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
      .min(2)
      .max(500),
  )
  .min(1)
  .max(40)
  .superRefine((strokes, ctx) => {
    const points = strokes.flat();
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    if (
      points.length < 6 ||
      points.length > 2000 ||
      Math.max(...xs) - Math.min(...xs) < 0.05 ||
      Math.max(...ys) - Math.min(...ys) < 0.02
    )
      ctx.addIssue({
        code: "custom",
        message: "Traccia una firma completa nello spazio indicato.",
      });
  });
export type Handwriting = z.infer<typeof handwritingSchema>;
const textVersion = z.object({
  id: z.uuid(),
  revision: z.number(),
  title: z.string(),
  body: z.string(),
  content_hash: z.string(),
});
export const signedSnapshotSchema = z.object({
  schema: z.literal(1),
  studio: z.string(),
  timezone: z.string(),
  client_name: z.string(),
  service_name: z.string(),
  starts_at: z.string(),
  consent: textVersion,
  anamnesis: textVersion
    .extend({ questions: z.array(questionSchema) })
    .nullable(),
  answers: z.record(z.string(), z.union([z.boolean(), z.string()])),
  lots: z.array(lotSnapshotSchema),
});
export const signatureContextSchema = z.object({
  mode: z.enum(["link", "tablet"]),
  expires_at: z.string(),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: signedSnapshotSchema,
});
export type SignatureContext = z.infer<typeof signatureContextSchema>;
export const signatureInputSchema = z
  .object({
    request_id: z.uuid(),
    snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
    signer_name: z.string().trim().min(2).max(150),
    confirmed: z.literal(true),
    signature: handwritingSchema,
  })
  .strict();
export const signatureSubmitSchema = signatureInputSchema
  .extend({ token: intakeTokenSchema })
  .strict();
export type SignatureInput = z.infer<typeof signatureInputSchema>;
export const consentReceiptSchema = z.object({
  id: z.uuid(),
  signed_at: z.string(),
});
export type ConsentReceipt = z.infer<typeof consentReceiptSchema>;
export const signedPayloadSchema = z.object({
  snapshot: signedSnapshotSchema,
  snapshot_hash: z.string(),
  signer_name: z.string(),
  signature: handwritingSchema,
  signed_at: z.string(),
  statement: z.string(),
  signature_kind: z.literal("drawn-v1"),
});
export type SignedPayload = z.infer<typeof signedPayloadSchema>;
export const consentMetadataSchema = z.object({
  id: z.uuid(),
  signed_at: z.string(),
  preparation_version: z.number(),
  previous_id: z.uuid().nullable(),
  document_state: z.enum(["pending", "ready", "failed"]),
  content_hash: z.string(),
});
export type ConsentMetadata = z.infer<typeof consentMetadataSchema>;
