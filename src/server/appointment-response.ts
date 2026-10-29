import "server-only";
import { linkSource, invokePublicLink } from "./public-links";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  responseContextSchema,
  responseReceiptSchema,
} from "@/lib/appointment-response";
import { ApiError, checkDb } from "./http";
import { z } from "zod";

export async function accessAppointmentResponse(
  request: Request,
  token: string,
  action: "read" | "confirm" | "cancel",
  requestId?: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  if (!local && host !== "mexokvvvxdyekauupwvt.supabase.co")
    throw new ApiError(503, "Appuntamento temporaneamente non raggiungibile.");
  const key = local
    ? process.env.TEST_SUPABASE_SERVICE_KEY
    : process.env.supabase_service_role_secret || process.env.supabase_secret;
  if (!key)
    throw new ApiError(503, "Appuntamento temporaneamente non raggiungibile.");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
  const result = await invokePublicLink(
    db,
    linkSource(request),
    "appointment",
    token,
    action,
    null,
    requestId ?? null,
  );
  checkDb(result.error);
  const parsed = z
    .object({
      ok: z.boolean(),
      status: z.number().optional(),
      code: z.string().optional(),
      context: z.unknown().optional(),
      receipt: z.unknown().optional(),
    })
    .parse(result.data);
  if (!parsed.ok) {
    if (parsed.status === 410)
      throw new ApiError(
        410,
        "Questo link è scaduto, revocato o riguarda un appuntamento modificato. Contatta lo studio per un nuovo collegamento.",
        "APPOINTMENT_LINK_UNAVAILABLE",
      );
    if (parsed.status === 422)
      throw new ApiError(
        422,
        "Il termine per disdire online è trascorso. Contatta direttamente lo studio.",
        "CANCELLATION_CLOSED",
      );
    if (parsed.status === 429)
      throw new ApiError(
        429,
        "Sono stati fatti molti tentativi. Attendi un minuto e riprova.",
        "RATE_LIMIT",
      );
    if (parsed.status === 409)
      throw new ApiError(
        409,
        "Questa richiesta è già stata utilizzata. Riapri il collegamento ricevuto.",
        "RESPONSE_CONFLICT",
      );
    throw new ApiError(
      400,
      "La richiesta non è valida. Riapri il collegamento ricevuto.",
    );
  }
  return parsed.receipt
    ? { receipt: responseReceiptSchema.parse(parsed.receipt) }
    : { context: responseContextSchema.parse(parsed.context) };
}
