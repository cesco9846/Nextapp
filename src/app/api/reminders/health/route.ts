import { checkDb, handleApi, json } from "@/server/http";
import { requireWorkspace } from "@/server/session";
export async function GET() {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("reminder_tenant_health");
    checkDb(result.error);
    return json(result.data);
  });
}
