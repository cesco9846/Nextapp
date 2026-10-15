import { z } from "zod";
import { memberSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, memberSchema);
    const { db } = await requireWorkspace(true);
    const { data, error } = await db.rpc("update_team_member", {
      p_id: id,
      p_version: body.version,
      p_active: body.active,
      p_clinical_access: body.clinical_access,
    });
    checkDb(error);
    return json(data);
  });
}
