import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { ResendReminderProvider } from "@/reminders/resend-provider";
import { verifyResendEvent, webhookBody } from "@/reminders/resend-webhook";
import type { Envelope } from "@/reminders/contracts";
const id = "aabbccdd-1111-4111-8111-111111111111";
const providerId = "aabbccdd-2222-4222-8222-222222222222";
const key = `glow-reminder-v1/${id}`;
const envelope: Envelope = {
  version: "glow-reminder-v2",
  from: "Glow <reminder@glowlabs.it>",
  reply_to: "owner@example.invalid",
  to: "synthetic@example.invalid",
  subject: "Promemoria appuntamento",
  text: "Hai un appuntamento con Studio il 25/10/2026 alle 09:00. Per variazioni contatta lo studio.",
};
function provider(response: () => Promise<Response>) {
  const transport = vi.fn(response);
  const evidence = vi.fn(async () => ({ kind: "unknown" as const }));
  return {
    adapter: new ResendReminderProvider(
      "synthetic-test-key",
      evidence,
      transport,
    ),
    transport,
    evidence,
  };
}
const signal = () => AbortSignal.timeout(1000);
describe("Resend conservative transport", () => {
  it("uses a frozen complete payload, fixed origin, stable key and only opaque correlation metadata", async () => {
    const p = provider(async () => Response.json({ id: providerId }));
    expect(await p.adapter.send(envelope, key, signal())).toEqual({
      kind: "accepted",
      providerId,
    });
    await p.adapter.send(envelope, key, signal());
    const [url, init] = p.transport.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ "Idempotency-Key": key });
    expect(JSON.parse(init.body as string)).toEqual({
      from: envelope.version === "glow-reminder-v2" ? envelope.from : "",
      reply_to: "owner@example.invalid",
      to: [envelope.to],
      subject: envelope.subject,
      text: envelope.text,
      tags: [{ name: "glow_message_id", value: id }],
    });
    const retry = p.transport.mock.calls[1] as unknown as [string, RequestInit];
    expect(retry[0]).toEqual(url);
    expect(retry[1].body).toEqual(init.body);
    expect(retry[1].headers).toEqual(init.headers);
  });
  it("rejects legacy envelopes and invalid correlation before network access", async () => {
    const p = provider(async () => Response.json({ id: providerId }));
    await expect(
      p.adapter.send(
        {
          version: "glow-reminder-v1",
          to: envelope.to,
          subject: envelope.subject,
          text: envelope.text,
        },
        key,
        signal(),
      ),
    ).resolves.toEqual({ kind: "rejected" });
    await expect(
      p.adapter.send(envelope, "not-a-glow-key", signal()),
    ).resolves.toEqual({ kind: "rejected" });
    expect(p.transport).not.toHaveBeenCalled();
  });
  it.each([429, 400, 401, 403, 422])(
    "classifies only explicit documented non-acceptance (%s)",
    async (status) => {
      const p = provider(async () =>
        Response.json(
          { name: status === 429 ? "rate_limit_exceeded" : "validation_error" },
          { status },
        ),
      );
      expect(await p.adapter.send(envelope, key, signal())).toEqual({
        kind: status === 429 ? "retryable" : "rejected",
      });
      expect(p.transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each([409, 500, 503, 404])(
    "keeps HTTP %s uncertain with no automatic POST retry",
    async (status) => {
      const p = provider(async () =>
        Response.json({ name: "concurrent_idempotent_requests" }, { status }),
      );
      expect(await p.adapter.send(envelope, key, signal())).toEqual({
        kind: "unknown",
      });
      expect(p.transport).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps malformed acceptance, network failure and lookup absence uncertain", async () => {
    for (const response of [
      async () => Response.json({}),
      async () => new Response("not-json"),
      async () => {
        throw new Error("lost response");
      },
    ]) {
      const p = provider(response);
      expect(await p.adapter.send(envelope, key, signal())).toEqual({
        kind: "unknown",
      });
    }
    const p = provider(async () => Response.json({ id: providerId }));
    expect(await p.adapter.lookup(key, signal())).toEqual({ kind: "unknown" });
    expect(p.evidence).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    expect(p.transport).not.toHaveBeenCalled();
  });
});
const secret = `whsec_${Buffer.from("synthetic-signing-secret-32-bytes!").toString("base64")}`;
function signed(type = "email.delivered", offset = 0) {
  const payload = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: providerId,
      from: "Glow <reminder@glowlabs.it>",
      to: [envelope.to],
      tags: { glow_message_id: id },
      bounce: { type: "Permanent" },
      subject: "must not persist",
      unrelated: "must not persist",
    },
  });
  const date = new Date(Date.now() + offset);
  const headers = new Headers({
    "svix-id": "msg_glow_synthetic",
    "svix-timestamp": Math.floor(date.getTime() / 1000).toString(),
    "svix-signature": new Webhook(secret).sign(
      "msg_glow_synthetic",
      date,
      payload,
    ),
  });
  return { payload, headers };
}
describe("Resend signed webhook boundary", () => {
  it("verifies raw signature and projects only minimal correlation fields", () => {
    const { payload, headers } = signed();
    const result = verifyResendEvent(payload, headers, secret);
    expect(result).toMatchObject({
      p_event_id: "msg_glow_synthetic",
      p_provider_id: providerId,
      p_message_id: id,
      p_type: "email.delivered",
      p_suppress: false,
    });
    expect(result).not.toHaveProperty("subject");
    expect(JSON.stringify(result)).not.toContain("must not persist");
    expect(() => verifyResendEvent(payload + " ", headers, secret)).toThrow();
    expect(() =>
      verifyResendEvent(
        payload,
        headers,
        `whsec_${Buffer.from("wrong-key").toString("base64")}`,
      ),
    ).toThrow();
  });
  it("rejects unsigned/stale/replayed-signature requests and ignores unrelated signed events", () => {
    const stale = signed("email.delivered", -600000);
    expect(() =>
      verifyResendEvent(stale.payload, stale.headers, secret),
    ).toThrow();
    const valid = signed();
    expect(() =>
      verifyResendEvent(valid.payload, new Headers(), secret),
    ).toThrow();
    const unsupported = signed("email.opened");
    expect(
      verifyResendEvent(unsupported.payload, unsupported.headers, secret),
    ).toBeNull();
  });
  it.each(["email.bounced", "email.complained", "email.suppressed"])(
    "suppresses definitive negative evidence %s",
    (type) => {
      const e = signed(type);
      expect(verifyResendEvent(e.payload, e.headers, secret)?.p_suppress).toBe(
        true,
      );
    },
  );
  it("limits actual streamed bytes even without Content-Length", async () => {
    const request = new Request("https://glow.example/api/webhooks/resend", {
      method: "POST",
      body: "x".repeat(65537),
    });
    await expect(webhookBody(request)).rejects.toThrow("BODY_LIMIT");
  });
});
