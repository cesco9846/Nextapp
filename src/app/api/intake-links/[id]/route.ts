import { z } from "zod";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { intakeLinkSchema } from "@/lib/intake";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const body = await readBody(
      request,
      z.object({ version: z.number().int().positive() }).strict(),
    );
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("revoke_intake_link", {
      p_id: id,
      p_version: body.version,
    });
    checkDb(r.error);
    return json(intakeLinkSchema.parse(r.data));
  });
}
