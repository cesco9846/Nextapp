import { z } from "zod";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
export async function GET() {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("reminder_preferences");
    checkDb(result.error);
    return json(result.data);
  });
}
export async function PUT(request: Request) {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const { enabled } = await readBody(
      request,
      z.object({ enabled: z.boolean() }).strict(),
    );
    const result = await db.rpc("reminder_preferences", { p_enabled: enabled });
    checkDb(result.error);
    return json(result.data);
  });
}
