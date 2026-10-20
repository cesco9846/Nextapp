import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

export const reply = (data: object, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function authenticateInvocation(
  request: Request,
  kind: "run" | "monitor" | "documents" | "cleanup",
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
    return { db, nonce, local };
  } catch {
    return reply({ status: "unavailable" }, 503);
  }
}
