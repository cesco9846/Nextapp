import { z } from "zod";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      z.object({ version: z.number().int().positive() }).strict(),
    );
    const { db } = await requireWorkspace();
    const result = await db.rpc("archive_photo", {
      p_id: id,
      p_version: body.version,
    });
    checkDb(result.error);
    return json({ ok: true });
  });
}
