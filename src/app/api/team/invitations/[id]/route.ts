import { z } from "zod";
import { checkDb, handleApi, json, requireSameOrigin } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    requireSameOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace(true);
    const { error } = await db.rpc("revoke_team_invitation", { p_id: id });
    checkDb(error);
    return json({ revoked: true });
  });
}
