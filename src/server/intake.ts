import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { intakeContextSchema, intakeReceiptSchema } from "@/lib/intake";
import { ApiError, checkDb } from "./http";

// This client never leaves this module. Its only operation is the constrained
// capability RPC, never arbitrary table reads or patient identifiers from callers.
export async function accessIntake(
  token: string,
  action: "read" | "submit",
  input?: {
    request_id: string;
    answers: Record<string, boolean | string>;
    confirm_read: true;
  },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  if (!local && host !== "mexokvvvxdyekauupwvt.supabase.co")
    throw new ApiError(503, "Compilazione temporaneamente non disponibile.");
  const key = local
    ? process.env.TEST_SUPABASE_SERVICE_KEY
    : process.env.supabase_service_role_secret || process.env.supabase_secret;
  if (!key)
    throw new ApiError(503, "Compilazione temporaneamente non disponibile.");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await db.rpc("use_intake_link", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_action: action,
    p_request_id: input?.request_id ?? null!,
    p_answers: input?.answers ?? null!,
    p_confirm_read: input?.confirm_read ?? null!,
  });
  checkDb(result.error);
  const envelope = z
    .object({
      ok: z.boolean(),
      status: z.number().optional(),
      code: z.string().optional(),
      context: z.unknown().optional(),
      receipt: z.unknown().optional(),
    })
    .parse(result.data);
  if (!envelope.ok) {
    if (envelope.status === 410)
      throw new ApiError(
        410,
        "Questo collegamento è scaduto, revocato o già utilizzato. Chiedi allo studio un nuovo link.",
        "INTAKE_UNAVAILABLE",
      );
    if (envelope.status === 422)
      throw new ApiError(
        422,
        "Completa le risposte richieste e controlla il tipo di risposta prima di inviare.",
        "INTAKE_ANSWERS",
      );
    if (envelope.status === 429)
      throw new ApiError(
        429,
        "Sono stati fatti molti tentativi. Attendi un minuto e riprova.",
        "RATE_LIMIT",
      );
    throw new ApiError(
      400,
      "La compilazione non è valida. Riapri il link ricevuto.",
      "INVALID_INTAKE",
    );
  }
  return action === "read"
    ? { context: intakeContextSchema.parse(envelope.context) }
    : { receipt: intakeReceiptSchema.parse(envelope.receipt) };
}
