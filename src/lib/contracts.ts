import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const name = z.string().trim().min(1, "Inserisci il nome.").max(100);
const optionalEmail = z
  .union([z.email("Controlla l'indirizzo email."), z.literal("")])
  .transform((v) => v || null);
const phone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const parsed = parsePhoneNumberFromString(value, "IT");
    if (!parsed?.isValid()) {
      ctx.addIssue({
        code: "custom",
        message:
          "Inserisci un numero di telefono valido, con prefisso internazionale.",
      });
      return z.NEVER;
    }
    return parsed.number;
  });

export const clientSchema = z
  .object({ first_name: name, last_name: name, email: optionalEmail, phone })
  .strict();
export const clientUpdateSchema = clientSchema.extend({
  version: z.number().int().positive(),
});
export const archiveSchema = z
  .object({ version: z.number().int().positive(), archived: z.boolean() })
  .strict();
export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const locationSchema = z
  .object({
    name: name.min(2),
    address: z.string().trim().max(300),
    color: colorSchema,
  })
  .strict();
export const serviceSchema = z
  .object({
    name: name.min(2),
    duration_minutes: z.number().int().min(5).max(1440),
    price_cents: z.number().int().min(0).max(100000000),
    color: colorSchema,
  })
  .strict();
export const bootstrapSchema = z
  .object({
    name: name.min(2),
    display_name: name.min(2),
    location: name.min(2),
    service: name.min(2),
    duration: z.number().int().min(5).max(1440),
    price: z.number().int().min(0).max(100000000),
  })
  .strict();
export const invitationSchema = z
  .object({
    email: z
      .email("Inserisci un indirizzo email valido.")
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    clinical_access: z.boolean(),
  })
  .strict();
export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "Riapri il collegamento di invito originale."),
    display_name: name.min(2, "Inserisci almeno due caratteri."),
  })
  .strict();
export const memberSchema = z
  .object({
    version: z.number().int().positive(),
    active: z.boolean(),
    clinical_access: z.boolean(),
  })
  .strict();
export const assignmentSchema = z
  .object({
    operator_id: z.uuid(),
    assigned: z.boolean(),
    version: z.number().int().min(0),
  })
  .strict();
export const appointmentStatusSchema = z.enum([
  "booked",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
]);
const dateTime = z.iso.datetime({ offset: true });
export const appointmentSchema = z
  .object({
    client_id: z.uuid(),
    service_id: z.uuid(),
    location_id: z.uuid(),
    operator_id: z.uuid(),
    starts_at: dateTime,
    ends_at: dateTime,
    price_cents: z.number().int().min(0).max(100000000),
  })
  .strict()
  .refine(
    (v) =>
      new Date(v.ends_at).getTime() > new Date(v.starts_at).getTime() &&
      new Date(v.ends_at).getTime() - new Date(v.starts_at).getTime() <=
        86400000,
    {
      message: "La fine deve essere successiva all'inizio, entro 24 ore.",
      path: ["ends_at"],
    },
  );
export const appointmentUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    service_id: z.uuid().optional(),
    location_id: z.uuid().optional(),
    operator_id: z.uuid().optional(),
    starts_at: dateTime.optional(),
    ends_at: dateTime.optional(),
    price_cents: z.number().int().min(0).max(100000000).optional(),
    status: appointmentStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: "Non ci sono modifiche da salvare.",
  });

export type ClientInput = z.input<typeof clientSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export const statusLabels: Record<AppointmentStatus, string> = {
  booked: "Prenotato",
  confirmed: "Confermato",
  completed: "Completato",
  no_show: "Non presentata",
  cancelled: "Annullato",
};

export const filePreparationSchema = z
  .object({
    request_id: z.uuid(),
    size_bytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    appointment_id: z.uuid().optional(),
  })
  .strict();
