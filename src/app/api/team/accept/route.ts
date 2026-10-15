import { acceptInvitationSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireSession } from "@/server/session";

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, acceptInvitationSchema);
    const { db } = await requireSession();
    const { data, error } = await db.rpc("accept_team_invitation", {
      p_token: body.token,
      p_display_name: body.display_name,
    });
    checkDb(error);
    return json({ tenant_id: data });
  });
}
