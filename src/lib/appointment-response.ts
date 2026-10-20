import { z } from "zod";
export const appointmentTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const responseReadSchema = z
  .object({ token: appointmentTokenSchema })
  .strict();
export const responseSubmitSchema = responseReadSchema
  .extend({
    action: z.enum(["confirm", "cancel"]),
    request_id: z.uuid(),
  })
  .strict();
export const responseContextSchema = z.object({
  studio: z.string(),
  timezone: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  location: z.string(),
  status: z.enum(["booked", "confirmed"]),
  expires_at: z.string(),
  cancel_until: z.string(),
  can_cancel: z.boolean(),
});
export const responseReceiptSchema = z.object({
  id: z.uuid(),
  action: z.enum(["confirm", "cancel"]),
  responded_at: z.string(),
});
export type ResponseContext = z.infer<typeof responseContextSchema>;
export type ResponseReceipt = z.infer<typeof responseReceiptSchema>;
export type ActionLinks = {
  links: {
    id: string;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
    schedule_revision: number;
    source: "manual" | "email";
  }[];
  events: ResponseReceipt[];
};
export type CreatedActionLink = {
  id: string;
  expires_at: string;
  token: string | null;
};
