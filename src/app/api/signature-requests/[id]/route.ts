import { z } from "zod";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function DELETE(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const body = await readBody(
      request,
      z.object({ version: z.number().int().positive() }).strict(),
    );
    const { db } = await requireClinical();
    const r = await db.rpc("revoke_signature_request", {
      p_id: id,
      p_version: body.version,
    });
    checkDb(r.error);
    return json({ ok: true });
  });
}
