import { z } from "zod";
import { professionalSchema } from "@/lib/packages";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { assertPackageText } from "@/server/package-text";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(
      request,
      z
        .object({
          version: z.number().int().min(0),
          details: professionalSchema,
        })
        .strict(),
    );
    await assertPackageText(b.details);
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("save_document_profile", {
      p_version: b.version,
      p_details: b.details,
    });
    checkDb(r.error);
    return json({ saved: true });
  });
}
