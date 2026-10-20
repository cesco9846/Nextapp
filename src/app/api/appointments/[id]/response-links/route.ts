import { z } from "zod";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace();
    const r = await db.rpc("manage_appointment_action_links", {
      p_appointment_id: id,
    });
    checkDb(r.error);
    return json(r.data);
  });
}
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      z
        .object({
          request_id: z.uuid(),
          appointment_version: z.number().int().positive(),
        })
        .strict(),
    );
    const { db } = await requireWorkspace();
    const r = await db.rpc("manage_appointment_action_links", {
      p_appointment_id: id,
      p_action: "issue",
      p_request_id: body.request_id,
      p_version: body.appointment_version,
    });
    checkDb(r.error);
    return json(r.data, 201);
  });
}
export async function DELETE(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      z.object({ link_id: z.uuid() }).strict(),
    );
    const { db } = await requireWorkspace();
    const r = await db.rpc("manage_appointment_action_links", {
      p_appointment_id: id,
      p_action: "revoke",
      p_link_id: body.link_id,
    });
    checkDb(r.error);
    return json(r.data);
  });
}
