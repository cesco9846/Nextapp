import { createHash } from "node:crypto";
import { z } from "zod";
import {
  documentAdmin,
  verifiedDocumentFile,
  privateBinary,
} from "@/server/documents";
import { ApiError, checkDb, handleApi, readBody } from "@/server/http";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(
      request,
      z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/), id: z.uuid() })
        .strict(),
    );
    async function authorize() {
      const r = await documentAdmin().rpc("use_consent_packet", {
        p_token_hash: createHash("sha256").update(b.token).digest("hex"),
        p_action: "label",
        p_input: { id: b.id },
      });
      checkDb(r.error);
      const result = z
        .object({ ok: z.boolean(), file: z.unknown().optional() })
        .parse(r.data);
      if (!result.ok)
        throw new ApiError(
          410,
          "Etichetta non disponibile: chiedi allo studio di verificare il documento.",
        );
      return z
        .object({
          path: z.string(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          size: z.number(),
          mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        })
        .parse(result.file);
    }
    const file = await authorize();
    const bytes = await verifiedDocumentFile("glow-private", file);
    const again = await authorize();
    if (JSON.stringify(file) !== JSON.stringify(again))
      throw new ApiError(410, "Etichetta non più disponibile.");
    return privateBinary(bytes, file.mime);
  });
}
