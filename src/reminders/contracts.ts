import { z } from "zod";
const legacyEnvelopeSchema = z
  .object({
    version: z.literal("glow-reminder-v1"),
    to: z.email(),
    subject: z.literal("Promemoria appuntamento"),
    text: z.string().min(1).max(1000),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const resendEnvelopeSchema = z
  .object({
    version: z.literal("glow-reminder-v2"),
    from: z.literal("Glow <reminder@glowlabs.it>"),
    reply_to: z
      .email()
      .max(254)
      .regex(/^[^\r\n]+$/),
    to: z.email().max(254),
    subject: z.literal("Promemoria appuntamento"),
    text: z.string().min(1).max(1000),
  })
  .strict();
// Historical/local test snapshots remain readable, but cannot go to Resend.
export const envelopeSchema = z.union([
  legacyEnvelopeSchema,
  resendEnvelopeSchema,
]);
export const claimSchema = z.object({
  id: z.uuid(),
  claim: z.uuid(),
  action: z.enum(["send", "reconcile"]),
  key: z.string().regex(/^glow-reminder-v1\/[a-f0-9-]{36}$/),
  envelope: envelopeSchema.nullable(),
});
export type Claim = z.infer<typeof claimSchema>;
export type Result =
  | { kind: "accepted"; providerId: string }
  | { kind: "retryable" | "rejected" | "unknown" };
export type LookupResult =
  | { kind: "accepted"; providerId: string }
  | { kind: "absent" | "rejected" | "unknown" };
// `retryable` and `absent` are proof of NON-acceptance. Timeouts, network
// errors, incomplete responses and non-authoritative 404s are always unknown.
export interface ReminderProvider {
  readonly name: string;
  send(envelope: Envelope, key: string, signal: AbortSignal): Promise<Result>;
  lookup(key: string, signal: AbortSignal): Promise<LookupResult>;
}
export interface ReminderStore {
  start(id: string, provider: string): Promise<boolean>;
  claim(run: string): Promise<Claim | null>;
  begin(job: Claim): Promise<Envelope | null>;
  finish(job: Claim, result: Result | LookupResult): Promise<void>;
  end(run: string, ok: boolean): Promise<void>;
}
