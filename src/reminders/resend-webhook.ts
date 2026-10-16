import { Webhook } from "svix";
import { z } from "zod";

export const resendEventSchema = z.object({
  type: z.string().max(100),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.uuid(),
    from: z.string().max(320),
    to: z.array(z.email().max(254)).length(1),
    tags: z.record(z.string(), z.string()).optional(),
    bounce: z
      .object({ type: z.string().max(40) })
      .passthrough()
      .optional(),
  }),
});
export const reminderEvents = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
];
export function verifyResendEvent(
  payload: string,
  headers: Headers,
  secret: string,
) {
  // Svix checks HMAC, timestamp tolerance and multiple signatures (rotation).
  // Verify exact raw bytes before parsing, never log payload/signature/secret.
  new Webhook(secret).verify(payload, {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  });
  // svix 2.8 verifies without returning parsed JSON.
  const result: unknown = JSON.parse(payload);
  const base = z
    .object({
      type: z.string(),
      data: z
        .object({ tags: z.record(z.string(), z.string()).optional() })
        .passthrough(),
    })
    .parse(result);
  const message = z.uuid().safeParse(base.data.tags?.glow_message_id);
  if (!reminderEvents.includes(base.type) || !message.success) return null;
  const event = resendEventSchema.parse(result);
  return {
    p_event_id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,200}$/)
      .parse(headers.get("svix-id")),
    p_message_id: message.data,
    p_provider_id: event.data.email_id,
    p_type: event.type,
    p_created_at: event.created_at,
    p_from: event.data.from,
    p_to: event.data.to[0],
    p_suppress:
      event.type === "email.complained" ||
      event.type === "email.suppressed" ||
      (event.type === "email.bounced" &&
        event.data.bounce?.type === "Permanent"),
  };
}

// Content-Length is optional and untrusted. Bound actual streamed bytes too.
export async function webhookBody(request: Request, max = 65536) {
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new Error("BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error("BODY_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}
