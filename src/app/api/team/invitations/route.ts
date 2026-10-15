import { invitationSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, invitationSchema);
    const { db } = await requireWorkspace(true);
    const { data, error } = await db.rpc("create_team_invitation", {
      p_email: body.email,
      p_clinical_access: body.clinical_access,
    });
    checkDb(error);
    return json(data, 201);
  });
}
