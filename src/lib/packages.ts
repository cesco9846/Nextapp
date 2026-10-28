import { z } from "zod";
import { questionSchema } from "./clinical";
import { handwritingSchema } from "./consents";
import microblading from "@/content/consents/microblading.json" with { type: "json" };
import lipblush from "@/content/consents/lipblush.json" with { type: "json" };
const text = z.string().trim();
export const packageContentSchema = z
  .object({
    key: z.enum(["microblading", "lipblush"]),
    revision: z.number().int().positive(),
    title: text.min(2).max(120),
    source_date: z.iso.date(),
    source_scope: text.max(1000),
    description: text.min(10).max(8000),
    treatment_statement: text.min(10).max(3000),
    introduction: text.min(10).max(2000),
    questions: z.array(questionSchema).min(1).max(30),
    aftercare: text.min(10).max(8000),
    aftercare_statement: text.min(10).max(1000),
    health_statement: text.min(10).max(2000),
    photo_notice: text.min(10).max(2000),
    photo_documentation: text.min(10).max(2000),
    photo_demonstration: text.min(10).max(2000),
    guardian_statement: text.min(10).max(2000),
    privacy_notice: text.max(10000),
    jurisdiction: text.max(200),
    minors_enabled: z.boolean(),
    minimum_age: z.number().int().min(0).max(17).nullable(),
    representatives_required: z.number().int().min(1).max(2).nullable(),
    minors_basis: text.max(2000),
    reviewed: z.boolean(),
  })
  .strict();
export type PackageContent = z.infer<typeof packageContentSchema>;
export const defaultPackages = [
  packageContentSchema.parse(microblading),
  packageContentSchema.parse(lipblush),
];
export const professionalSchema = z
  .object({
    legal_name: text.min(2).max(150),
    tax_id: text.min(5).max(40),
    data_controller: text.min(2).max(150),
    address: text.min(3).max(300),
    email: z.email().max(254),
    phone: text.min(5).max(40),
    pec: z.union([z.email(), z.literal("")]),
  })
  .strict();
export type Professional = z.infer<typeof professionalSchema>;
export const packageSaveSchema = z
  .object({
    id: z.uuid().nullable(),
    version: z.number().int().min(0),
    service_id: z.uuid(),
    content: packageContentSchema,
  })
  .strict();
export const personSchema = z
  .object({
    name: text.min(2).max(150),
    role: z.enum(["parent", "guardian"]),
    contact: text.min(3).max(254),
    verification_method: text.min(10).max(1000),
    verified: z.literal(true),
  })
  .strict();
export const packetDetailsSchema = z
  .object({
    date_of_birth: z.iso.date(),
    birthplace: text.min(1).max(150),
    session_kind: z.enum(["first", "retouch", "maintenance"]),
    identity_verified: z.literal(true),
    verification_method: text.min(10).max(1000),
    representatives: z.array(personSchema).max(2),
  })
  .strict();
export const packetIssueSchema = z
  .object({
    request_id: z.uuid(),
    appointment_version: z.number().int().positive(),
    package_version_id: z.uuid(),
    details: packetDetailsSchema,
    lot_ids: z.array(z.uuid()).max(12),
    mode: z.enum(["link", "tablet"]),
  })
  .strict();
export const packetActionSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["read", "health", "answers", "sign"]),
    input: z.unknown().optional(),
  })
  .strict();
export const packetSignSchema = z
  .object({
    request_id: z.uuid(),
    snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    aftercare_received: z.literal(true),
    authority_confirmed: z.literal(true),
    signature: handwritingSchema,
    photo_documentation: z.boolean(),
    photo_demonstration: z.boolean(),
    photo_scope: z.enum(["none", "detail", "recognizable"]),
  })
  .strict()
  .refine((v) => !v.photo_demonstration || v.photo_documentation, {
    message: "L’uso dimostrativo richiede la documentazione nel dossier.",
  })
  .refine(
    (v) =>
      v.photo_demonstration
        ? v.photo_scope !== "none"
        : v.photo_scope === "none",
    { message: "Scegli l’ambito delle immagini autorizzate." },
  );
export type ConsentPackage = {
  id: string;
  version: number;
  service_id: string;
  content: PackageContent;
  published_version_id: string | null;
  published_revision: number;
};
export type PackageCatalog = {
  profile: { version: number; details: Professional } | null;
  items: ConsentPackage[];
};
export type PacketParty = {
  id: string;
  ordinal: number;
  identity: {
    name: string;
    role: string;
    contact: string;
    verification_method: string;
    verified_by: string;
    verified_at: string;
  };
  health: { allowed: boolean; at: string } | null;
  signed: boolean;
};
export type PacketState = {
  id: string;
  version: number;
  revoked: boolean;
  expires_at: string;
  document_id: string | null;
  ready_to_countersign: boolean;
  parties: PacketParty[];
  snapshot_hash: string | null;
  details: z.infer<typeof packetDetailsSchema>;
};
export type PacketContext = {
  id: string;
  party_id: string;
  stage: "health" | "waiting" | "answers" | "sign" | "signed" | "declined";
  studio: string;
  client_name: string;
  starts_at: string;
  timezone: string;
  role: string;
  signer_name: string;
  content: PackageContent;
  professional: Professional;
  details: z.infer<typeof packetDetailsSchema>;
  expires_at: string;
  snapshot_hash: string | null;
  answers: Record<string, boolean | string>;
  snapshot?: unknown;
};
export const sessionLabels = {
  first: "Prima seduta",
  retouch: "Ritocco",
  maintenance: "Mantenimento",
};
const identitySchema = z.object({
  name: z.string(),
  role: z.enum(["self", "parent", "guardian"]),
  contact: z.string(),
  verification_method: z.string(),
  verified_by: z.uuid(),
  verified_at: z.string(),
});
export const healthReceiptSchema = z.object({
  allowed: z.boolean(),
  at: z.string(),
  signer: identitySchema,
  statement: z.string(),
  privacy_notice: z.string(),
  package_hash: z.string(),
});
export const packetSnapshotSchema = z.object({
  schema: z.literal("glow-pmu-v1"),
  content: packageContentSchema,
  professional: professionalSchema,
  details: packetDetailsSchema,
  package_hash: z.string(),
  health_receipts: z.array(healthReceiptSchema).min(1).max(2),
});
export const partyReceiptSchema = z.object({
  signer: identitySchema,
  at: z.string(),
  input: packetSignSchema,
  snapshot_hash: z.string(),
  treatment_statement: z.string(),
  aftercare_statement: z.string(),
  guardian_statement: z.string().nullable(),
});
export const counterReceiptSchema = z.object({
  name: z.string(),
  actor_id: z.uuid(),
  at: z.string(),
  snapshot_hash: z.string(),
  signature: handwritingSchema,
  statement: z.string(),
});
/** Called only after showing the source comparison and an explicit draft action. */
export function suggestPackageUpdate(
  current: PackageContent,
  latest: PackageContent,
): PackageContent {
  if (current.key !== latest.key || latest.revision <= current.revision)
    throw Error("Nessun aggiornamento della stessa base disponibile.");
  return {
    ...structuredClone(latest),
    privacy_notice: current.privacy_notice,
    jurisdiction: current.jurisdiction,
    minors_enabled: current.minors_enabled,
    minimum_age: current.minimum_age,
    representatives_required: current.representatives_required,
    minors_basis: current.minors_basis,
    reviewed: false,
  };
}
