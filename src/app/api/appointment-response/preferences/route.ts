import { z } from "zod";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
export async function GET() {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("appointment_response_preferences");
    checkDb(r.error);
    return json(r.data);
  });
}
export async function PUT(request: Request) {
  return handleApi(async () => {
    const body = await readBody(
      request,
      z.object({ notice_hours: z.number().int().min(0).max(168) }).strict(),
    );
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("appointment_response_preferences", {
      p_notice_hours: body.notice_hours,
    });
    checkDb(r.error);
    return json(r.data);
  });
}
