import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import {
  signatureContextSchema,
  consentReceiptSchema,
  type SignatureInput,
} from "@/lib/consents";
import { ApiError, checkDb } from "./http";
import { assertDocumentCharacters } from "@/documents/pdf-renderer";

// The privileged client remains local to the document server modules. Ordinary
// listing, issuance, revocation and read authorization use the user's session.
export function documentAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  if (!local && host !== "mexokvvvxdyekauupwvt.supabase.co")
    throw new ApiError(503, "Archivio documenti non disponibile.");
  const key = local
    ? process.env.TEST_SUPABASE_SERVICE_KEY
    : process.env.supabase_service_role_secret || process.env.supabase_secret;
  if (!key) throw new ApiError(503, "Archivio documenti non configurato.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const fileSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().optional(),
});
export async function verifiedDocumentFile(
  bucket: "glow-private" | "glow-documents",
  input: unknown,
) {
  const file = fileSchema.parse(input);
  const result = await documentAdmin().storage.from(bucket).download(file.path);
  if (result.error || !result.data)
    throw new ApiError(
      503,
      "Il documento non è disponibile. Riprova tra poco.",
    );
  const bytes = new Uint8Array(await result.data.arrayBuffer());
  if (
    sha256(bytes) !== file.sha256 ||
    (file.size !== undefined && bytes.length !== file.size)
  )
    throw new ApiError(
      503,
      "La verifica del documento non è riuscita. Contatta lo studio.",
      "DOCUMENT_INTEGRITY",
    );
  return bytes;
}
export function privateBinary(
  bytes: Uint8Array,
  type: string,
  attachment = false,
) {
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(attachment
        ? { "Content-Disposition": 'attachment; filename="consenso-glow.pdf"' }
        : {}),
    },
  });
}
export async function accessSignature(
  token: string,
  action: "read" | "sign" | "label",
  input?: SignatureInput | { id: string },
) {
  if (action === "sign" && input && "signer_name" in input) {
    try {
      await assertDocumentCharacters(input.signer_name);
    } catch {
      throw new ApiError(
        422,
        "Scrivi nome e cognome usando lettere e segni di punteggiatura, senza emoji o simboli speciali.",
        "UNSUPPORTED_DOCUMENT_TEXT",
      );
    }
  }
  const result = await documentAdmin().rpc("use_signature_request", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_action: action,
    p_input: input ?? null!,
  });
  checkDb(result.error);
  const envelope = z
    .object({
      ok: z.boolean(),
      status: z.number().optional(),
      code: z.string().optional(),
      context: z.unknown().optional(),
      receipt: z.unknown().optional(),
      file: z.unknown().optional(),
    })
    .parse(result.data);
  if (!envelope.ok) {
    if (envelope.status === 410)
      throw new ApiError(
        410,
        "Questo collegamento è scaduto, revocato o già utilizzato. Chiedi allo studio un nuovo link.",
        "SIGNATURE_UNAVAILABLE",
      );
    if (envelope.status === 429)
      throw new ApiError(
        429,
        "Attendi un minuto prima di riprovare.",
        "RATE_LIMIT",
      );
    throw new ApiError(
      422,
      "Controlla nome, firma e conferma di lettura prima di inviare.",
      "INVALID_SIGNATURE",
    );
  }
  if (action === "read") {
    const context = signatureContextSchema.parse(envelope.context);
    try {
      await assertDocumentCharacters(context.snapshot);
    } catch {
      throw new ApiError(
        422,
        "Il documento contiene caratteri non supportati dal PDF. Chiedi allo studio di controllare i testi prima di firmare.",
        "UNSUPPORTED_DOCUMENT_TEXT",
      );
    }
    return { context };
  }
  if (action === "sign")
    return { receipt: consentReceiptSchema.parse(envelope.receipt) };
  const file = fileSchema
    .extend({
      bucket: z.literal("glow-private"),
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })
    .parse(envelope.file);
  return {
    image: await verifiedDocumentFile("glow-private", file),
    mime: file.mime,
  };
}
