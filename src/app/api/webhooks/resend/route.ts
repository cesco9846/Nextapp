import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { verifyResendEvent, webhookBody } from "@/reminders/resend-webhook";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
function reply(status: number) {
  return new Response(null, { status, headers });
}
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url) return reply(503);
  const host = new URL(url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  if (!local && host !== "mexokvvvxdyekauupwvt.supabase.co") return reply(503);
  const key = local
    ? process.env.TEST_SUPABASE_SERVICE_KEY
    : process.env.supabase_service_role_secret || process.env.supabase_secret;
  if (!key) return reply(503);
  let event;
  try {
    event = verifyResendEvent(
      await webhookBody(request),
      request.headers,
      secret,
    );
  } catch {
    return reply(400);
  }
  if (!event) return reply(204);
  try {
    const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    // Only the verified/minimized projection reaches a constrained service RPC.
    const { error } = await db.rpc("record_resend_event", event);
    return reply(error ? 503 : 204); // provider retries transient DB failures
  } catch {
    return reply(503);
  }
}
