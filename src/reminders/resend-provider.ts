import { z } from "zod";
import {
  resendEnvelopeSchema,
  type Envelope,
  type ReminderProvider,
  type Result,
  type LookupResult,
} from "./contracts";

const keySchema = z.string().regex(/^glow-reminder-v1\/[a-f0-9-]{36}$/);
const responseSchema = z.object({ id: z.uuid() });
const errorSchema = z.object({ name: z.string() });

// Single fixed origin, redirects forbidden, no automatic HTTP/SDK retries.
// Credentials and provider response bodies must never be logged.
export class ResendReminderProvider implements ReminderProvider {
  readonly name = "resend-v1";
  constructor(
    private readonly apiKey: string,
    private readonly evidence: (
      messageId: string,
      signal: AbortSignal,
    ) => Promise<LookupResult>,
    private readonly transport: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("Resend credential unavailable");
  }
  async send(
    value: Envelope,
    key: string,
    signal: AbortSignal,
  ): Promise<Result> {
    const parsed = resendEnvelopeSchema.safeParse(value);
    if (!parsed.success || !keySchema.safeParse(key).success)
      return { kind: "rejected" };
    const { from, reply_to, to, subject, text } = parsed.data;
    // Versioned data is frozen in SQL. Tags carry only the opaque outbox ID;
    // no tenant, patient, appointment, service, or clinical metadata leaves Glow.
    const body = JSON.stringify({
      from,
      reply_to,
      to: [to],
      subject,
      text,
      tags: [{ name: "glow_message_id", value: key.split("/")[1] }],
    });
    try {
      const response = await this.transport("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body,
      });
      const data: unknown = await response.json();
      if (response.ok) {
        const result = responseSchema.safeParse(data);
        return result.success
          ? { kind: "accepted", providerId: result.data.id }
          : { kind: "unknown" };
      }
      const error = errorSchema.safeParse(data);
      if (!error.success) return { kind: "unknown" };
      // Explicit documented refusal before acceptance. Backoff lives in SQL.
      if (
        response.status === 429 &&
        [
          "rate_limit_exceeded",
          "daily_quota_exceeded",
          "monthly_quota_exceeded",
        ].includes(error.data.name)
      )
        return { kind: "retryable" };
      if (
        [400, 401, 403, 422].includes(response.status) &&
        [
          "validation_error",
          "invalid_idempotency_key",
          "missing_api_key",
          "restricted_api_key",
          "invalid_permission",
          "suspended_api_key",
          "invalid_attachment",
          "invalid_parameter",
          "missing_required_field",
          "missing_required_parameter",
        ].includes(error.data.name)
      )
        return { kind: "rejected" };
      // 409 conflict/concurrency, 5xx, malformed response, timeout and network:
      // the original request may be accepted. Reposting is not a lookup.
      return { kind: "unknown" };
    } catch {
      return { kind: "unknown" };
    }
  }
  async lookup(key: string, signal: AbortSignal): Promise<LookupResult> {
    if (!keySchema.safeParse(key).success) return { kind: "unknown" };
    try {
      return await this.evidence(key.split("/")[1], signal);
    } catch {
      return { kind: "unknown" };
    }
  }
}
