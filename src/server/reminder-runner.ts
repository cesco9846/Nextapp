import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { parseHealth, reminderStore } from "@/reminders/store";
import { runReminderBatch } from "@/reminders/worker";
import { ResendReminderProvider } from "@/reminders/resend-provider";

const headers = { "Cache-Control": "private, no-store" };
const reply = (data: object, status = 200) =>
  Response.json(data, { status, headers });

export async function reminderInvocation(
  request: Request,
  kind: "run" | "monitor",
) {
  const secret = process.env.REMINDER_RUNNER_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret))
    return reply({ status: "unavailable" }, 503);
  const supplied = request.headers.get("x-glow-signature") ?? "";
  const stamp = request.headers.get("x-glow-time") ?? "";
  const nonce = request.headers.get("x-glow-nonce") ?? "";
  if (
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !/^\d{10}$/.test(stamp) ||
    !z.uuid().safeParse(nonce).success ||
    Math.abs(Date.now() / 1000 - Number(stamp)) > 90
  )
    return reply({ status: "unauthorized" }, 401);
  const expected = createHmac("sha256", secret)
    .update(`${kind}\n${stamp}\n${nonce}`)
    .digest();
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), expected))
    return reply({ status: "unauthorized" }, 401);
  // Machine invocation only, with no caller-controlled tenant, provider or batch size.
  const reader = request.body?.getReader();
  let size = 0,
    body = "";
  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 64) {
        await reader.cancel();
        return reply({ status: "invalid" }, 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  }
  try {
    z.object({})
      .strict()
      .parse(JSON.parse(body || "{}"));
  } catch {
    return reply({ status: "invalid" }, 400);
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error();
    const host = new URL(url).hostname;
    const local = ["127.0.0.1", "localhost"].includes(host);
    if (
      !local &&
      (host !== "mexokvvvxdyekauupwvt.supabase.co" ||
        new URL(url).protocol !== "https:")
    )
      throw new Error();
    const key = local
      ? process.env.TEST_SUPABASE_SERVICE_KEY
      : process.env.supabase_service_role_secret || process.env.supabase_secret;
    if (!key) throw new Error();
    const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(3000)])
              : AbortSignal.timeout(3000),
          }),
      },
    });
    const consumed = await db.rpc("consume_reminder_invocation", {
      p_nonce: nonce,
      p_stamp: Number(stamp),
    });
    if (consumed.error) throw new Error();
    if (consumed.data !== true)
      return reply({ status: "duplicate_or_expired" }, 409);
    const result = await db.rpc("reminder_worker_health", {
      p_persist: kind === "monitor",
    });
    if (result.error) throw new Error();
    const health = parseHealth(result.data);
    if (kind === "monitor")
      return reply(health, health.status === "degraded" ? 503 : 200);
    if (health.mode === "disabled")
      return reply({ mode: "disabled", claimed: 0, accepted: 0 });
    // Live transport is impossible in loopback tests, even if a real key was inherited.
    if (local || !process.env.RESEND_API_KEY) throw new Error();
    const provider = new ResendReminderProvider(
      process.env.RESEND_API_KEY,
      async (id, signal) => {
        const { data, error } = await db
          .rpc("lookup_reminder_acceptance", { p_id: id })
          .abortSignal(signal);
        if (error) return { kind: "unknown" };
        const evidence = z
          .object({ kind: z.literal("accepted"), providerId: z.uuid() })
          .safeParse(data);
        return evidence.success ? evidence.data : { kind: "unknown" };
      },
    );
    // Vercel's hard maxDuration is 60s. Stop starting work after35s, leaving
    // headroom for final acknowledgement/end; a hard stop recovers through leases.
    return reply(
      await runReminderBatch(reminderStore(db), provider, {
        limit: 3,
        budgetMs: 35000,
      }),
    );
  } catch {
    return reply({ status: "unavailable" }, 503);
  }
}
