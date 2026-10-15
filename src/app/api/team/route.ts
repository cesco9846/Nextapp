import { checkDb, handleApi, json } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function GET() {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const [members, invitations] = await Promise.all([
      db.from("users").select("*").order("display_name").limit(200),
      db
        .from("user_invitations")
        .select(
          "id,email,role,clinical_access,created_at,expires_at,accepted_at,revoked_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    checkDb(members.error);
    checkDb(invitations.error);
    return json({ members: members.data, invitations: invitations.data });
  });
}
