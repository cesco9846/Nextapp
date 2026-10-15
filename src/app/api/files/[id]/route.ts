import { z } from "zod";
import { checkDb, handleApi, json, requireSameOrigin } from "@/server/http";
import { requireWorkspace } from "@/server/session";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: Context) {
  return handleApi(async () => {
    requireSameOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace();
    const result = await db.rpc("cancel_client_file", { p_id: id });
    checkDb(result.error);
    return json({ cancelled: true });
  });
}
