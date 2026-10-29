import { linkSource, invokePublicLink } from "@/server/public-links";
import { z } from "zod";
import { packetActionSchema, packetSignSchema } from "@/lib/packages";
import { documentAdmin } from "@/server/documents";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { assertPackageText } from "@/server/package-text";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(request, packetActionSchema);
    let input: unknown = null;
    if (b.action === "sign") input = packetSignSchema.parse(b.input);
    else if (b.action === "health")
      input = z.object({ allowed: z.boolean() }).strict().parse(b.input);
    else if (b.action === "answers")
      input = z
        .object({
          answers: z.record(
            z.uuid(),
            z.union([z.boolean(), z.string().max(500)]),
          ),
        })
        .strict()
        .parse(b.input);
    await assertPackageText(input);
    const r = await invokePublicLink(
      documentAdmin(),
      linkSource(request),
      "packet",
      b.token,
      b.action,
      input,
    );
    checkDb(r.error);
    const data = z
      .object({
        ok: z.boolean(),
        status: z.number().optional(),
        code: z.string().optional(),
        context: z.unknown().optional(),
      })
      .parse(r.data);
    if (!data.ok) {
      const messages: Record<string, string> = {
        DETAILS_REQUIRED:
          "Hai risposto Sì: aggiungi una spiegazione nel campo dedicato.",
        INCOMPLETE_ANSWERS: "Completa tutte le risposte richieste.",
        INVALID_ANSWERS: "Controlla le risposte al questionario.",
        INVALID_SIGNATURE: "Completa conferme, scelte e firma.",
        RATE_LIMIT: "Attendi un minuto prima di riprovare.",
      };
      throw new ApiError(
        data.status ?? 410,
        messages[data.code ?? ""] ??
          "Il documento è scaduto, revocato o modificato. Chiedi allo studio un nuovo collegamento.",
        data.code,
      );
    }
    return json(data.context);
  });
}
